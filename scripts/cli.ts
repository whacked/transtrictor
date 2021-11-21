import * as fs from 'fs'
import * as GenerateSchema from 'generate-schema';
import { hideBin } from 'yargs/helpers';
import yargs from 'yargs/yargs';
import { Argv } from 'yargs';
import { renderJsonnet, validateDataWithSchema, validateJsonnetWithSchema, ValidationResult } from '../src/jsvg-lib';
import {
    loadTransformerFile, slurp, unwrapTransformationContext, wrapTransformationContext
} from '../src/transformer';
import * as readline from 'readline'


export interface IYarguments {
    input: string,
    jsonLines: string,
    schema?: string,
    transformer?: string,
    postTransformSchema?: string,
}

let yargOptions: { [key in keyof IYarguments]: any } = {
    schema: {
        alias: 's',
        type: 'string',
        description: 'path to json(net) json-schema file',
    },
    input: {
        alias: 'i',
        type: 'string',
        description: 'path to input json(net) file, or "-" for STDIN, to validate against schema',
        nargs: 1,
    },
    jsonLines: {
        alias: 'j',
        type: 'string',
        description: 'path to JSONL generator json(net) file, or "-" for STDIN, to validate against schema',
        nargs: 1,
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
}

export class ArgParser<T> {

    readonly argParser: Argv;
    constructor(yargOptions: { [key in keyof T]: any }) {
        this.argParser = yargs(hideBin(process.argv)).options(yargOptions)
    }

    getArgs(): T {
        let args: any = this.argParser.parseSync()
        return args as T
    }
}

export async function cliMain(args: IYarguments): Promise<any> {
    const schemaJsonnetSource = slurp(args.schema)

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

    async function processJsonnetStringTransformation(targetDataJsonnetSource: string) {
        return validateJsonnetWithSchema(
            targetDataJsonnetSource,
            schemaJsonnetSource
        ).then(
            async (result: ValidationResult) => {
                if (!result.isValid) {
                    console.error('OUTPUT VALIDATION ERROR', result.errors)
                    return process.exit(1)
                }
                const resultData = await runTransform(result.data);
                console.log(JSON.stringify(resultData, null, 2));
                return resultData
            })
    }


    if (args.input != null) {
        if (args.input == '-') {
            process.stdin.resume();
            process.stdin.setEncoding('utf-8');
            let readBuffer: string = ''
            return new Promise((resolve, reject) => {
                process.stdin.on('data', inputData => {
                    readBuffer += inputData
                })
                process.stdin.on('end', _ => {
                    resolve(readBuffer)
                })
            }).then((targetDataJsonnetSource) => {
                return processJsonnetStringTransformation(targetDataJsonnetSource as string)
            })
        } else {
            return Promise.resolve(
                processJsonnetStringTransformation(slurp(args.input)))
        }
    } else if (args.jsonLines != null) {
        let lineReader: readline.Interface
        let interfaceOptions = {
            output: process.stdout,
            terminal: false,
        }
        if (args.jsonLines == '-') {
            lineReader = readline.createInterface({
                ...interfaceOptions,
                input: process.stdin,
            })
        } else {
            lineReader = readline.createInterface({
                ...interfaceOptions,
                input: fs.createReadStream(args.jsonLines),
            })
        }
        return new Promise((resolve, reject) => {
            lineReader.on('line', async (line) => {
                processJsonnetStringTransformation(line)
            })
        })
    }
}

if (require.main == module) {
    const argParser = yargs(hideBin(process.argv)).options(yargOptions)
    const args = argParser.parseSync() as IYarguments
    if (args.input == null && args.jsonLines == null
        || args.input != null && args.jsonLines != null
    ) {
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

        cliMain(args).finally(() => {
            process.exit(0)
        })
    }
}