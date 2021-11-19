import * as GenerateSchema from 'generate-schema';
import { hideBin } from 'yargs/helpers';
import yargs from 'yargs/yargs';
import { renderJsonnet, validateDataWithSchema, validateJsonnetWithSchema, ValidationResult } from '../src/jsvg-lib';
import {
    loadTransformerFile, slurp, unwrapTransformationContext, wrapTransformationContext
} from '../src/transformer';


export interface IYarguments {
    input: string,
    schema?: string,
    transformer?: string,
    postTransformSchema?: string,
}

const argParser = yargs(hideBin(process.argv)).options({
    schema: {
        alias: 's',
        type: 'string',
        description: 'path to json(net) json-schema file',
    },
    input: {
        alias: 'i',
        type: 'string',
        description: 'path to input json(net) file to validate against schema',
    },
    transformer: {
        alias: 't',
        type: 'string',
        description: 'path to transformer file: .jsonata, .json (morphism)',
    },
    postTransformSchema: {
        alias: 'p',
        type: 'string',
        description: 'path to json(net) json-schema to validate post-transformation output',
    },
})


export async function cliMain(args: IYarguments): Promise<any> {
    const schemaJsonnetSource = slurp(args.schema)
    const targetDataJsonnetSource = slurp(args.input)
    const postTransformSchemaJsonnetSource = args.postTransformSchema == null ? null : slurp(args.postTransformSchema)

    let runTransform: (input: any) => Promise<any>;
    if (args.transformer == null) {
        runTransform = async (input) => {
            return Promise.resolve(input)
        }
    } else {
        runTransform = async (input: any) => {
            let transformer = loadTransformerFile(args.transformer)
            return transformer.transform(wrapTransformationContext(input)).then((transformedData) => {
                return unwrapTransformationContext(transformedData)
            }).then((resultData) => {
                if (postTransformSchemaJsonnetSource == null) {
                    return resultData
                } else {
                    return renderJsonnet(postTransformSchemaJsonnetSource).then((resolvedJsonSchema) => {
                        return validateDataWithSchema(resultData, resolvedJsonSchema)
                    }).then((result) => {
                        if (!result.isValid) {
                            console.error('POST TRANSFORM VALIDATION ERROR', result.errors)
                            return process.exit(2)
                        }

                        return result.data
                    })
                }
            })
        }
    }

    return validateJsonnetWithSchema(targetDataJsonnetSource, schemaJsonnetSource).then((result: ValidationResult) => {
        if (!result.isValid) {
            console.error('OUTPUT VALIDATION ERROR', result.errors)
            return process.exit(1)
        }
        return runTransform(result.data)
    })
}

if (require.main == module) {
    const args = argParser.parseSync()
    if (args.input == null) {
        argParser.showHelp()
        process.exit()
    }

    if (args.schema == null) {
        let inputJsonnetSource = slurp(args.input)
        renderJsonnet(inputJsonnetSource).then((renderedData) => {
            let schema = GenerateSchema.json(
                'GeneratedSchema',
                renderedData,
            )
            console.log(JSON.stringify(schema, null, 2))
            process.exit(0)
        })
    } else {

        cliMain(args).then((resultData) => {
            console.log(JSON.stringify(resultData, null, 2))
            process.exit(0)
        })
    }
}