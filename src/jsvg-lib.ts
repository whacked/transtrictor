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
    /**
     * WARNING: this causes surprising behavior!
     * see https://json-schema.org/understanding-json-schema/structuring.html#id
     * and https://json-schema.org/understanding-json-schema/structuring.html#bundling
     * for some relevant information on why $id is necessary somewhere;
     * commit history doens't adequately explain id -> $id but it most likely
     * involves internal reference/de-referencing.
     */
    if (typeof jsonSchemaObject !== "object" || jsonSchemaObject == null) {
        return
    }
    if (jsonSchemaObject["id"] != null
        && typeof jsonSchemaObject["id"] == 'string'
        && (
            jsonSchemaObject["id"].startsWith('/')
            || jsonSchemaObject["id"].startsWith('http')
        )
    ) {
        jsonSchemaObject["$id"] = jsonSchemaObject["id"]
        delete jsonSchemaObject["id"]
    }
    Object.keys(jsonSchemaObject).forEach((key) => {
        preprocessJsonSchema_BANG(jsonSchemaObject[key])
    })
}

function jsonnetWithJpaths(paths: Array<string>): Jsonnet {
    let jsonnet = new Jsonnet()
    for (const path of paths) {
        jsonnet = jsonnet.addJpath(path)
    }
    return jsonnet
}

export async function renderJsonnet(jsonnetSource: string, shouldDefererence: boolean = true): Promise<object> {
    const jsonnet = jsonnetWithJpaths(process.env['JSONNET_PATH'] == null ? [process.cwd()] : process.env['JSONNET_PATH'].split(':'))
    let jsonString: string
    try {
        jsonString = await jsonnet.evaluateSnippet(jsonnetSource)
    } catch (e) {
        console.error(e)
        throw e
    }
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


export interface ValidationResult<TargetType = any> {
    data: TargetType
    schema: any
    isValid: boolean
    errors: Array<ErrorObject>
}

export function validateDataWithSchema<OutputType = any>(data: any, schema: any): Promise<ValidationResult<OutputType>> {
    const ajv = new Ajv({ strict: false })
    let isValid = ajv.validate(schema, data)
    let result: ValidationResult = {
        data: <OutputType>data,
        schema: schema,
        isValid: isValid,
        errors: ajv.errors,
    }
    return Promise.resolve(result as ValidationResult)
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

export async function validateJsonnetWithSchema<OutputType = any>(targetDataJsonnet: string, schemaJsonnet: string): Promise<ValidationResult<OutputType>> {
    const jsonnet = new Jsonnet()
    return renderJsonnet(
        schemaJsonnet
    ).then(async (resolvedJsonSchema) => {
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
