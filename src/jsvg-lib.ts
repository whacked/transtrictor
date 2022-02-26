import $RefParser from '@apidevtools/json-schema-ref-parser';
import { Jsonnet } from '@hanazuki/node-jsonnet';
import Ajv, { ErrorObject } from 'ajv';
import {
    IDataTransformer,
    IWrappedDataContext,
    loadTransformerFile,
    unwrapTransformationContext,
    wrapTransformationContext,
} from './transformer';
import { slurp } from './util';


function preprocessJsonSchema_BANG(jsonSchemaObject: object) {
    if (typeof jsonSchemaObject !== "object") {
        return
    }
    if (jsonSchemaObject["id"] != null) {
        jsonSchemaObject["$id"] = jsonSchemaObject["id"]
        delete jsonSchemaObject["id"]
    }
    Object.keys(jsonSchemaObject).forEach((key) => {
        preprocessJsonSchema_BANG(jsonSchemaObject[key])
    })
}


export async function renderJsonnet(jsonnetSource: string, shouldDefererence: boolean = true): Promise<object> {

    const jsonnet = new Jsonnet()
    const jsonString = await jsonnet.evaluateSnippet(jsonnetSource)
    const jsonObject = JSON.parse(jsonString)
    if (shouldDefererence) {
        let dereferenced = await $RefParser.dereference(jsonObject)
        preprocessJsonSchema_BANG(dereferenced)
        // this may or may not help with schemas with circular defs
        // but Ajv will not work with circular schcemas
        // https://ajv.js.org/security.html#circular-references-in-javascript-objects
        // return jc.decycle(dereferenced)
        return Promise.resolve(dereferenced)
    } else {
        return jsonObject
    }
}


export interface ValidationResult {
    data: any
    schema: any
    isValid: boolean
    errors: Array<ErrorObject>
}

export function validateDataWithSchema(data: object, schema: object): Promise<ValidationResult> {
    const ajv = new Ajv({ strict: false })
    let result = {
        data: data,
        schema: schema,
        isValid: ajv.validate(schema, data),
        errors: ajv.errors
    }
    return Promise.resolve(result)
}

export class SourceValidationError extends Error { }
export class TargetValidationError extends Error { }

export class Schema2Schema {

    constructor(public readonly sourceSchema: object, public readonly targetSchema: object) {

    }

    async transformDataWithTransformer(
        sourceData: IWrappedDataContext,
        transformer: IDataTransformer
    ) {
        let validatedSource = await validateDataWithSchema(sourceData.input, this.sourceSchema)
        if (!validatedSource.isValid) {
            throw new SourceValidationError(`SOURCE DATA\n\n${JSON.stringify(validatedSource.data, null, 2)}\n\nFAILED TO VALIDATE AGAINST SCHEMA\n\n${JSON.stringify(validatedSource.schema, null, 2)}\n`)
        }
        const transformedData = await transformer.transform(sourceData)
        let validatedTarget = await validateDataWithSchema(transformedData.output, this.targetSchema)
        if (!validatedTarget.isValid) {
            throw new TargetValidationError(`TARGET DATA\n\n${JSON.stringify(validatedTarget.data, null, 2)}\n\nFAILED TO VALIDATE AGAINST SCHEMA\n\n${JSON.stringify(validatedTarget.schema, null, 2)}\n`)
        }
        return transformedData
    }
}

export async function schema2SchemaTransform(
    sourceSchema: object,
    targetSchema: object,
    sourceData: IWrappedDataContext,
    transformer: IDataTransformer
) {
    let s2s = new Schema2Schema(sourceSchema, targetSchema)
    return s2s.transformDataWithTransformer(sourceData, transformer)
}

export async function validateJsonnetWithSchema(targetDataJsonnet: string, schemaJsonnet: string): Promise<ValidationResult> {
    const jsonnet = new Jsonnet()
    return renderJsonnet(
        schemaJsonnet
    ).then((resolvedJsonSchema) => {
        // HACK: breaks the validator, so forcibly remove the key
        delete resolvedJsonSchema["$schema"]
        return renderJsonnet(targetDataJsonnet).then((validationTarget) => {
            return validateDataWithSchema(validationTarget, resolvedJsonSchema)
        })
    })
}

export class JS {
    static type(typeName: string, data: object) {
        return Object.assign({ type: typeName }, data ?? {})
    }
    static typeString(data?: object) {
        return JS.type('string', data)
    }
    static typeNumber(data?: object) {
        return JS.type('number', data)
    }
    static typeBoolean(data?: object) {
        return JS.type('boolean', data)
    }
    static typeArray(data?: object) {
        return JS.type('array', {
            items: data,
        })
    }
    static typeObject(data?: object) {
        return JS.type('object', {
            properties: data,
        })
    }
}


export type AsyncInputOutputTransformerFunction<InputInterface, OutputInterface> = (inputData: InputInterface) => Promise<OutputInterface>
// NOTE: this is basically a reusable version of transformer.applyValidatedTransform
export async function makeReusableTransformerWithValidation<InputInterface, OutputInterface>(
    inputDataSchemaPath: string,
    transformerPath: string,
    outputDataSchemaPath: string,
): Promise<AsyncInputOutputTransformerFunction<InputInterface, OutputInterface>> {
    let inputDataSchemaSource = slurp(inputDataSchemaPath)
    let inputDataSchema = await renderJsonnet(inputDataSchemaSource)

    let transformer = loadTransformerFile(transformerPath)

    let outputDataSchemaSource = slurp(outputDataSchemaPath)
    let outputDataSchema = await renderJsonnet(outputDataSchemaSource)

    async function runTransformerWithValidation(inputData: InputInterface): Promise<OutputInterface> {
        let inputValidationResult = await validateDataWithSchema(inputData as any, inputDataSchema)
        if (!inputValidationResult.isValid) {
            console.error(inputValidationResult.errors)
            throw new Error('input data failed schema validation')
        }

        let transformedData = await transformer.transform(wrapTransformationContext(inputData)).then((transformedData) => {
            console.log('TRANS', inputData)
            return unwrapTransformationContext(transformedData)
        })

        let outputValidationResult = await validateDataWithSchema(transformedData, outputDataSchema)
        if (!outputValidationResult.isValid) {
            console.error(outputValidationResult.errors)
            throw new Error('output data failed schema validation')
        }

        return transformedData as OutputInterface
    }

    return runTransformerWithValidation
}

export async function runTransformerWithValidation<InputInterface, OutputInterface>(
    inputData: InputInterface,
    inputDataSchemaPath: string,
    transformerPath: string,
    outputDataSchemaPath: string,
): Promise<OutputInterface> {
    return makeReusableTransformerWithValidation<InputInterface, OutputInterface>(
        inputDataSchemaPath,
        transformerPath,
        outputDataSchemaPath,
    ).then((transformProcessor) => {
        return transformProcessor(inputData)
    })
}