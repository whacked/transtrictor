import yargs from 'yargs/yargs'
import { hideBin } from 'yargs/helpers'
import { Jsonnet } from '@hanazuki/node-jsonnet'
import * as fs from 'fs'
import $RefParser from '@apidevtools/json-schema-ref-parser'
import Ajv from 'ajv'
import { ErrorObject } from 'ajv'
import { morphism } from 'morphism'
import * as jc from 'json-cycle'


export enum TransformerLanguage {
    Morphism = 'morphism'
}

export interface IWrappedDataContext {
    input: Object;
    output?: Object;
    [key: string]: Object;
}


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


export async function renderJsonnet(jsonnetSource: string): Promise<object> {

    const jsonnet = new Jsonnet()
    const jsonString = await jsonnet.evaluateSnippet(jsonnetSource)
    const jsonObject = JSON.parse(jsonString)
    let dereferenced = await $RefParser.dereference(jsonObject)
    preprocessJsonSchema_BANG(dereferenced)
    // this may or may not help with schemas with circular defs
    // but Ajv will not work with circular schcemas
    // https://ajv.js.org/security.html#circular-references-in-javascript-objects
    // return jc.decycle(dereferenced)
    return Promise.resolve(dereferenced)
}


export interface IDataTransformer {
    transform: (input: IWrappedDataContext) => Promise<IWrappedDataContext>
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

export function wrapTransformationContext(transformableData: object, context: object = {}): IWrappedDataContext {
    return {
        ...context,
        input: transformableData,
    }
}

export function unwrapTransformationContext(wrappedDataContext: IWrappedDataContext) {
    if (wrappedDataContext.output == null) {
        console.warn('WARNING: wrapped data has no "output" field')
    }
    return wrappedDataContext.output
}


export class MorphismTransformer implements IDataTransformer {
    language: TransformerLanguage.Morphism

    constructor(public readonly schema: object) {
    }

    async transform(inputData: IWrappedDataContext) {
        return morphism(this.schema, inputData) as IWrappedDataContext
    }
}

export class SourceValidationError extends Error { }
export class TargetValidationError extends Error { }

export class Schema2Schema {

    constructor(public readonly sourceSchema: object, public readonly targetSchema: object) {

    }

    async transformDataWithTransformer(sourceData: IWrappedDataContext, transformer: IDataTransformer) {
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

export async function schema2SchemaTransform(sourceSchema: object, targetSchema: object, sourceData: IWrappedDataContext, transformer: IDataTransformer) {
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


if (require.main == module) {
    const argParser = yargs(hideBin(process.argv))
        .options({
            schema: {
                alais: 's',
                type: 'string',
                description: 'path to json(net) json-schema file',
            },
            input: {
                alais: 'i',
                type: 'string',
                description: 'path to input json(net) file to validate against schema',
            }
        })

    const args = argParser.parseSync()
    if (args.schema == null || args.input == null) {
        argParser.showHelp()
        process.exit()
    }

    const schemaJsonnetSource = fs.readFileSync(args.schema, "utf-8")
    const targetDataJsonnetSource = fs.readFileSync(args.input, "utf-8")

    validateJsonnetWithSchema(targetDataJsonnetSource, schemaJsonnetSource).then((result: ValidationResult) => {
        if (result.isValid) {
            console.log(JSON.stringify(result.data, null, 2))
            process.exit(0)
        } else {
            console.error(result.errors)
            process.exit(1)
        }
    })
}
