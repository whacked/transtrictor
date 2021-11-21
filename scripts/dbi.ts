import { canonicalize } from 'json-canonicalize';
import { hideBin } from 'yargs/helpers';
import yargs from 'yargs/yargs';
import { ensureFileSystemInputSourceInDatabase, ensureJsonSchemaInDatabase, getSha256, KnexDbInterface, loadEnvDefinedDatabase } from '../src/database';
import { renderJsonnet } from '../src/jsvg-lib';
import { slurp } from '../src/transformer';


export interface IYarguments {
    schema: string,
    inputSource: string,
    getSha256?: boolean,
    ensureInDatabase: boolean,
}


let yargOptions: { [key in keyof IYarguments]: any } = {
    schema: {
        alias: 's',
        type: 'string',
        description: 'path to json(net) json-schema file',
    },
    inputSource: {
        alias: 'i',
        type: 'string',
        description: 'path to input file for content caching',
    },
    getSha256: {
        type: 'boolean',
        description: 'show the sha256 of the canonicalized schema',
    },
    ensureInDatabase: {
        type: 'boolean',
        description: 'get or create in database, then print its record',
    },
}


if (require.main == module) {
    const argParser = yargs(hideBin(process.argv)).options(yargOptions).usage('with no extra options, get the canonicalized schema')
    const args = argParser.parseSync() as IYarguments
    argParser.showHelp()

    const knex = loadEnvDefinedDatabase()
    const knexDbi = new KnexDbInterface(knex)

    if (args.schema) {
        const schemaJsonnetSource = slurp(args.schema)
        renderJsonnet(schemaJsonnetSource, false).then(async (renderedJson) => {
            // renderedJson: object = { a: 1, c: 3, b: 5 }
            if (args.ensureInDatabase) {
                return ensureJsonSchemaInDatabase(knexDbi, renderedJson).then((sha256) => {
                    return sha256
                })
            }

            let canonicalizedJson = canonicalize(renderedJson)
            if (args.getSha256) {
                return getSha256(canonicalizedJson)
            } else {
                return canonicalizedJson
            }
        }).then((outputString) => {
            console.log(outputString)
        })
    }

    if (args.inputSource) {
        const inputSourceContent = slurp(args.inputSource)
        ensureFileSystemInputSourceInDatabase(knexDbi, args.inputSource).then((sha256) => {
            console.log(sha256)
        })
    }
}