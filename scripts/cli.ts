import * as fs from 'fs'
import * as GenerateSchema from 'generate-schema';
import { hideBin } from 'yargs/helpers';
import yargs from 'yargs/yargs';
import { Argv } from 'yargs';
import { renderJsonnet, validateDataWithSchema, validateJsonnetWithSchema, ValidationResult } from '../src/jsvg-lib';
import {
    loadTransformerFile, unwrapTransformationContext, wrapTransformationContext
} from '../src/transformer';
import * as readline from 'readline'
import { slurp } from '../src/util';


export interface IYarguments {
    input: string,
    jsonLines: string,
    schema?: string,
    transformer?: string,
    postTransformSchema?: string,
    context?: string,
    keyedContext?: Array<string>,
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
    context: {
        alias: 'c',
        type: 'string',
        description: 'object that gets added at the ROOT level of the wrapped data for transformation',
    },
    keyedContext: {
        alias: 'k',
        type: 'array',
        description: 'triplets of <keyName schemaFilePath dataFilePath> of data that gets added at <keyName> to the ROOT level of the wrapped data for transformation',
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

function readStdinOrFile(inputPath: string): Promise<string> {
    if (inputPath == '-') {
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
            return targetDataJsonnetSource as string
        })
    } else {
        return Promise.resolve(slurp(inputPath))
    }
}

export async function cliMain(args: IYarguments): Promise<any> {
    const schemaJsonnetSource = slurp(args.schema)

    const postTransformSchemaJsonnetSource = args.postTransformSchema == null ? null : slurp(args.postTransformSchema)
    const keyedContext: Record<string, any> = {}
    let numKeyContext = args.keyedContext == null ? 0 : args.keyedContext.length
    for (let i = 0; i < numKeyContext; i += 3) {
        let contextKey = args.keyedContext[i]
        let contextSchemaFile = args.keyedContext[i + 1]
        let dataFilePath = args.keyedContext[i + 2]
        let keyedContextData = await renderJsonnet(slurp(dataFilePath))
        let keyedContextSchema = await renderJsonnet(slurp(contextSchemaFile))
        keyedContext[contextKey] = await validateDataWithSchema(keyedContextData, keyedContextSchema)
    }
    let runTransform: (input: any) => Promise<any>;
    if (args.transformer == null) {
        runTransform = async (input) => {
            return Promise.resolve(input)
        }
    } else {
        runTransform = async (input: any) => {
            let transformer = loadTransformerFile(args.transformer)
            return transformer.transform(wrapTransformationContext(
                input,
                {
                    ...keyedContext,
                    ...(args.context != null ? JSON.parse(args.context) : null)
                }
            )).then((transformedData) => {
                return unwrapTransformationContext(transformedData)
            }).then(async (resultData) => {
                if (postTransformSchemaJsonnetSource == null) {
                    return resultData
                } else {
                    let resolvedJsonSchema = await renderJsonnet(postTransformSchemaJsonnetSource)
                    let validationResult = await validateDataWithSchema(resultData, resolvedJsonSchema)
                    if (!validationResult.isValid) {
                        console.error('POST TRANSFORM VALIDATION ERROR', validationResult.errors)
                        return process.exit(2)
                    }

                    return validationResult.data
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
        return readStdinOrFile(args.input).then((jsonnetSource: string) => {
            return processJsonnetStringTransformation(jsonnetSource)
        })
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
        readStdinOrFile(args.input).then((inputJsonnetSource: string) => {
            return renderJsonnet(inputJsonnetSource)
        }).then((renderedData) => {
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