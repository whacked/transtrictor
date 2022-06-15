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
import { bailIfNotExists, readStdin, slurp } from '../src/util';
import { monkeyPatchConsole } from '../src/util';
monkeyPatchConsole()


export interface IYarguments {
    input: string,
    jsonLines: string,
    schema?: string,
    transformer?: string,
    postTransformSchema?: string,
    context?: string,
    keyedContext?: Array<string>,
    verbosity?: number,
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
    // [deletion candidate] this is probably a bad idea because it avoids schematization before the transformer; JSONNET_PATH seems better
    keyedContext: {
        alias: 'k',
        type: 'array',
        description: 'triplets of <keyName schemaFilePath dataFilePath> of data that gets added at <keyName> to the ROOT level of the wrapped data for transformation',
    },
    verbosity: {
        alias: 'v',
        type: 'number',
        default: 1,
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

async function readStdinOrFile(inputString: string): Promise<string> {
    if (inputString == '-') {
        return readStdin().then((targetDataJsonnetSource) => {
            return targetDataJsonnetSource as string
        })
    } else if (inputString.startsWith('{')) {  // assume json object
        return Promise.resolve(inputString)
    } else {
        return Promise.resolve(slurp(inputString))
    }
}

export async function cliMain(args: IYarguments): Promise<any> {
    let t0 = Date.now()
    const tok = args.verbosity > 1
        ? (s = '') => { process.stderr.write(` - ${Date.now() - t0}s ${s == null ? '' : ': ' + s}\n`) }
        : () => { }
    tok('initializing...')

    const schemaJsonnetSource = args.schema && slurp(args.schema)
    const postTransformSchemaJsonnetSource = args.postTransformSchema && slurp(args.postTransformSchema)

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

    let transformer: Transformer = args.transformer == null ? null : loadTransformerFile(args.transformer)
    let runTransform: (input: any) => Promise<any> = transformer == null
        ? async (input) => {
            return Promise.resolve(input)
        }
        : async (input: any) => {
            let transformer = loadTransformerFile(args.transformer)
            let context: any
            try {
                context = args.context != null ? JSON.parse(args.context) : null
            } catch (e) {
                throw new Error(`failed to parse context: ${args.context}`)
            }
            return transformer.transform(wrapTransformationContext(
                input,
                {
                    ...keyedContext,
                    ...(args.context != null ? JSON.parse(args.context) : null)
                }
            )).catch((error) => {
                console.log('ERROR run transform', error)
                throw error
            }).then((transformedData) => {
                return unwrapTransformationContext(transformedData)
            }).then(async (resultData) => {
                if (postTransformSchemaJsonnetSource == null) {
                    return resultData
                } else {
                    let resolvedJsonSchema = await renderJsonnet(postTransformSchemaJsonnetSource)
                    // WARNING: maybe this doesn't play well with the $schema key
                    delete resolvedJsonSchema['$schema']
                    let validationResult = await validateDataWithSchema(resultData, resolvedJsonSchema)
                    if (!validationResult.isValid) {
                        console.error('POST TRANSFORM VALIDATION ERROR', validationResult.errors)
                        if (args.verbosity > 0) {
                            console.warn('INPUT DATA:')
                            console.warn('^' + JSON.stringify(resultData, null, 2) + '$')
                        }
                        return process.exit(2)
                    }

                    return validationResult.data
                }
            })
        }

    async function processJsonnetStringTransformation(targetDataJsonnetSource: string) {

        if (schemaJsonnetSource == null) {
            return runTransform(JSON.parse(targetDataJsonnetSource));
        }

        tok('validating...')
        return validateJsonnetWithSchema(
            targetDataJsonnetSource,
            schemaJsonnetSource
        ).then(
            async (result: ValidationResult) => {
                tok('finished validation')
                if (!result.isValid) {
                    console.error('OUTPUT VALIDATION ERROR', result.errors)
                    return process.exit(1)
                }
                tok('transforming...')
                const resultData = await runTransform(result.data);
                tok('transformed')
                return resultData
            })
    }

    tok('starting cli process...')

    if (args.input != null) {
        return readStdinOrFile(args.input).then((jsonnetSource: string) => {
            tok('reading stdin...')
            return processJsonnetStringTransformation(jsonnetSource).then((resultData) => {
                process.stdout.write(JSON.stringify(resultData, null, 2));
                process.stdout.write('\n')
            })
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
                processJsonnetStringTransformation(line).then((resultData) => {
                    process.stdout.write(JSON.stringify(resultData) + '\n')
                })
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

    if (args.schema == null && args.transformer == null) {
        readStdinOrFile(args.input).then((inputJsonnetSource: string) => {
            return renderJsonnet(inputJsonnetSource)
        }).then((renderedData) => {
            let schema = GenerateSchema.json(
                'GeneratedSchema',
                renderedData,
            )
            process.stdout.write(JSON.stringify(schema, null, 2))
            process.exit(0)
        })
    } else {
        cliMain(args).catch((error) => {
            console.error(error)
        }).finally(() => {
            process.exit(0)
        })
    }
}
