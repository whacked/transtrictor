import PouchDB from 'pouchdb'
import express from 'express'
import ExpressPouchDb from 'express-pouchdb'
import ExpressFileUpload, { UploadedFile } from 'express-fileupload'
import {
    PouchDbConfig,
    POUCHDB_ADAPTER_CONFIG,
    SchemaStatisticsLoader,
} from '../src/docdb'
import { canonicalize as canonicalizeJson } from 'json-canonicalize'
import yargs, { Argv } from 'yargs';
import { hideBin } from 'yargs/helpers';
import { validateDataWithSchema, ValidationResult } from '../src/jsvg-lib';
import SchemaTaggedPayloadJsonSchemaSchema from '../src/autogen/schemas/SchemaTaggedPayloadJsonSchema.schema.json'
import { SchemaTaggedPayload } from '../src/autogen/interfaces/anthology/2022/03/25/SchemaTaggedPayload'
import { Transformer } from '../src/autogen/interfaces/anthology/2022/03/30/Transformer'
import Ajv from 'ajv';
import Draft04Schema from 'json-metaschema/draft-04-schema.json'
import {
    Config,
    CURRENT_PROTOCOL_VERSION,
    JSON_SCHEMAS_TABLE_NAME,
    SCHEMA_TAGGED_PAYLOADS_TABLE_NAME,
    TRANSFORMERS_TABLE_NAME,
} from '../src/defs';
import {
    createProxyMiddleware,
} from 'http-proxy-middleware'
import { getJcsSha256, isEmpty, monkeyPatchConsole, toSha256Checksum } from '../src/util';
import { makeTransformer, TransformerLanguage, unwrapTransformationContext, wrapTransformationContext } from '../src/transformer'
import { PouchDatabase } from '../src/jsonstore/xouchdb'
import { JsonDatabase } from '../src/jsonstore'
import { ArangoDatabase } from '../src/jsonstore/arangodb'
import { PostgresDatabase } from '../src/jsonstore/postgres'
import { SqliteDatabase } from '../src/jsonstore/sqlite'
monkeyPatchConsole()


const POUCHDB_BAD_REQUEST_RESPONSE = {  // this is copied from the error response from posting invalid JSON to express-pouchdb at /api
    error: "bad_request",
    reason: "invalid_json",
}

function getDraft04SchemaValidator(): Ajv {
    let ajv = new Ajv()
    let schemaKey = Draft04Schema['$schema']
    if (ajv.getSchema(schemaKey) != null) {
        return ajv
    }
    // FIXES so ajv accepts the draft 4 schema
    let schemaWithoutSchemaKey = Object.assign({}, Draft04Schema)
    delete schemaWithoutSchemaKey['$schema']
    schemaWithoutSchemaKey['$id'] = schemaWithoutSchemaKey['id']
    delete schemaWithoutSchemaKey['id']
    schemaWithoutSchemaKey['properties']['multipleOf']['exclusiveMinimum'] = 1 as any
    ajv.addMetaSchema(schemaWithoutSchemaKey, schemaKey)
    return ajv
}



// this isn't being used downstream anywhere
interface IYarguments {
    database: string,
}

export async function startWebserver(args: IYarguments = null) {

    let jsonDatabase: JsonDatabase
    let databaseServerLocation: string

    const databaseEngineLoadOrder: Array<[
        string,
        string,
        () => Promise<any>,
    ]> = [
            [Config.PGDATABASE,
            `[postgres] ${Config.PGHOST}/${Config.PGDATABASE}`,
            async () => { return PostgresDatabase.getSingleton() }],
            [Config.ARANGODB_SERVER_URL,
            `[arango] ${Config.ARANGODB_SERVER_URL}`,
            async () => { return Promise.resolve(new ArangoDatabase()) },
            ],
            [Config.COUCHDB_SERVER_URL,
            `[couchdb] ${Config.COUCHDB_SERVER_URL}`,
            async () => { return Promise.resolve(new PouchDatabase()) },
            ],
            [Config.POUCHDB_DATABASE_PREFIX,
            `[pouchdb] ${Config.POUCHDB_DATABASE_PREFIX}`,
            async () => { return Promise.resolve(new PouchDatabase()) },
            ],
            [Config.SQLITE_DATABASE_PATH,
            `[sqlite] ${Config.SQLITE_DATABASE_PATH}`,
            async () => { return SqliteDatabase.getSingleton() },
            ],
        ]

    for (const [checkString, settingMessage, initializer] of databaseEngineLoadOrder) {
        if (!isEmpty(checkString)) {
            databaseServerLocation = settingMessage
            jsonDatabase = await initializer()
            break
        }
    }

    if (jsonDatabase == null) {
        throw new Error('you must initialize the json database object!')
    }

    const app = express()
    app.use(ExpressFileUpload())

    const EXPRESS_COUCHDB_API_PREFIX = '/api'

    if (Config.COUCHDB_SERVER_URL != null) {
        app.use('/api', createProxyMiddleware({
            target: Config.COUCHDB_SERVER_URL,
            changeOrigin: true,
            pathRewrite: { '^/api': '' },
            auth: `${Config.COUCHDB_AUTH_USERNAME}:${Config.COUCHDB_AUTH_PASSWORD}`,
        }))
    } else if (Config.POUCHDB_DATABASE_PREFIX != null) {
        const expressPouchDbHandler = ExpressPouchDb(PouchDbConfig, {
            logPath: Config.EXPRESS_POUCHDB_LOG_PATH,
        })

        // FIXME
        // hot fix to allow mounting express-pouchdb from non / path
        // ref https://github.com/pouchdb/express-pouchdb/issues/290#issuecomment-265311015
        // app.use('/', expressPouchDbHandler)
        // app.use(EXPRESS_COUCHDB_API_PREFIX, expressPouchDbHandler)
        // /*
        // this is not working anymore
        app.use((req: express.Request, res: express.Response, next: Function) => {
            let referer = req.header('Referer')
            let refererUrl: URL
            if (referer != null) {
                refererUrl = new URL(referer)
            }
            if (!req.url.startsWith(EXPRESS_COUCHDB_API_PREFIX)) {
                // console.log('checking the url', refererUrl?.pathname, req.url)

                // if (/^\/(?:_utils|_session|_all_dbs|_users)/.test(refererUrl?.pathname ?? req.url)) {
                if (/^\/(?:_utils|_session|_all_dbs|_users)/.test(req.url)
                    || refererUrl?.pathname?.startsWith(EXPRESS_COUCHDB_API_PREFIX)) {
                    console.log('matches the special route', req.url)
                    return expressPouchDbHandler(req, res)
                    // FIXME FIXME
                    // was there this one route hack you had to apply??? look in git history

                    // } else if (req.url == '' && refererUrl?.pathname == `${EXPRESS_POUCHDB_PREFIX}/_utils/`) {
                    //     // non-working code in attempt to allow loading fauxon from /prefix/
                    //     // this doesn't work because the endpoint for resources for fauxson are hard-coded
                    //     // in the front-end javascript, and targets /_utils from the root addr
                    //     return expressPouchDbHandler(req, res)
                } else {
                    return next()
                }
            }
            if (req.url.replace(/^\//, '').endsWith('/_utils')) {
                // console.log('utils', req.url)

                // the pouch handler redirects non-slashed paths to the slashed path,
                // back to the unqualified path (/_utils/), which does NOT have our handler
                return res.redirect(req.originalUrl + '/')
            }
            let originalUrl = req.originalUrl
            req.url = req.originalUrl = originalUrl.substring(EXPRESS_COUCHDB_API_PREFIX.length)  // [1/2] required for successful inner middleware call
            req.baseUrl = ''  // [2/2] required for successful inner middleware call
            return expressPouchDbHandler(req, res);
        });

        // enable fauxton from /_utils
        // FIXME NOTE this breaks everything else!
        // this is only useful when browsing already-inserted data
        // app.use(expressPouchDbHandler)
    }

    app.use(express.json({
        verify: (req: express.Request, res: express.Response, buf: Buffer, encoding: string) => {  // capture raw body into request.rawBody
            if (buf && buf.length > 0) {
                req['rawBody'] = buf.toString(encoding || 'utf-8')
            }
        },
    }))

    function getRawBodyJson(req: express.Request) {
        try {
            return JSON.parse(req['rawBody'])
        } catch (e) {
            return {}
        }
    }

    app.post(`/${TRANSFORMERS_TABLE_NAME}`, async (req: express.Request, res: express.Response) => {
        let maybeFile = req.files?.file as UploadedFile
        if (maybeFile == null) {
            return res.json({
                status: 'error',
                message: 'there was no file in the request',
            })
        }

        let matchGroups = maybeFile.name.match(/(.+)\.([^\.]+)$/)
        let transformerName = matchGroups[1]
        let transformerLanguage = matchGroups[2]
        let sourceCode = maybeFile.data.toString()

        let transformerRecord: Transformer = {
            language: transformerLanguage as any,
            sourceCode,
            sourceCodeChecksum: toSha256Checksum(sourceCode),
            name: transformerName,
        }

        let errors = []
        if (req.body.outputSchema != null) {
            await jsonDatabase.findLatestMatchingSchema(req.body.outputSchema).then((doc) => {
                if (doc == null) {
                    errors.push(`did not find any schema matching output schema "${req.body.outputSchema}"`)
                }
            })
            transformerRecord.outputSchema = req.body.outputSchema
        }
        if (req.body.inputSchemas != null) {
            let inputSchemaNames = req.body.inputSchemas.split(',').map((s: string) => s.trim())
            for (const inputSchemaName of inputSchemaNames) {
                await jsonDatabase.findLatestMatchingSchema(inputSchemaName).then((doc) => {
                    if (doc == null) {
                        errors.push(`did not find any schema matching input schema "${inputSchemaName}"`)
                    }
                })
            }
            transformerRecord.supportedInputSchemas = inputSchemaNames
        }

        if (errors.length > 0) {
            return res.json({
                status: 'error',
                errors: errors,
            })
        }

        return jsonDatabase.putTransformer(transformerRecord).then((response) => {
            return res.json(response)
        }).catch((error) => {
            return res.json(error)
        })
    })

    app.post(`/${JSON_SCHEMAS_TABLE_NAME}`, async (req: express.Request, res: express.Response) => {
        let unvalidatedPayload: any
        let ajv = getDraft04SchemaValidator()
        try {
            unvalidatedPayload = getRawBodyJson(req)
            let isValid: any
            isValid = ajv.validate(SchemaTaggedPayloadJsonSchemaSchema, unvalidatedPayload)
            if (!isValid) {
                console.warn(unvalidatedPayload)
                throw new Error('failed on version and title precondition')
            }
            isValid = ajv.validateSchema(unvalidatedPayload)
            if (!isValid) {
                console.log(ajv.errors)
                throw new Error(`inbound schema failed to validate against ${unvalidatedPayload['$schema']}`)
            }
        } catch (e) {
            console.warn(e)
            console.log(unvalidatedPayload)
            return res.json({
                ...POUCHDB_BAD_REQUEST_RESPONSE,
                status: 'error',
                errors: ajv.errors,
            })
        }

        return jsonDatabase.putSchema(unvalidatedPayload)
            .then((response) => {
                return res.json(response)
            }).catch((error) => {
                console.log(error)
                return res.json(error)
            })
    })

    app.get(`/${SCHEMA_TAGGED_PAYLOADS_TABLE_NAME}/:schemaNameMaybeWithVersion`, async (req: express.Request, res: express.Response) => {
        let [schemaName, schemaVersion] = req.params['schemaNameMaybeWithVersion'].split('@')
        // this used to look for schemas inside SchemaTaggedPayload... verify this!
        let maybeSchema = await jsonDatabase.getSchema(
            schemaName, schemaVersion
        )
        if (maybeSchema != null) {
            return res.json(maybeSchema)
        } else {
            return res.json({
                status: 'error',
                message: 'nothing found',
            })
        }
    })

    app.post(`/${SCHEMA_TAGGED_PAYLOADS_TABLE_NAME}/:schemaNameMaybeWithVersion`, async (req: express.Request, res: express.Response) => {
        let [schemaName, schemaVersion] = req.params['schemaNameMaybeWithVersion'].split('@')
        let createdAt: number = req.query['createdAt'] == null ? Date.now() / 1e3 : parseFloat(req.query['createdAt'] as string)

        let maybeSchema: any
        try {
            maybeSchema = await jsonDatabase.getSchema(
                schemaName, schemaVersion
            )
        } catch (error) {
            console.warn(`failed to load schema ${schemaName}@${schemaVersion}`)
            console.log(error)
            return res.json(error)
        }
        if (maybeSchema == null) {
            return res.json({
                status: 'error',
                message: `no such schema: ${schemaName}`,
            })
        }

        let validationResult: ValidationResult
        let unvalidatedPayload = getRawBodyJson(req)
        try {
            delete maybeSchema['$schema']
            validationResult = await validateDataWithSchema(unvalidatedPayload, maybeSchema)
        } catch (e) {
            console.error(e)
            return res.json(POUCHDB_BAD_REQUEST_RESPONSE)
        }

        if (!validationResult.isValid) {
            console.log('FAIL', unvalidatedPayload)
            for (const error of validationResult.errors) {
                console.log(error)
            }
            return res.json(validationResult)
        } else {
            let dataChecksum = toSha256Checksum(JSON.stringify(unvalidatedPayload))

            // TAG WRAPPING HAPPENS HERE
            let schemaTaggedPayload: SchemaTaggedPayload = {
                protocolVersion: CURRENT_PROTOCOL_VERSION,
                dataChecksum,
                createdAt,
                data: unvalidatedPayload,
                schemaName: maybeSchema['title'],
                schemaVersion: maybeSchema['version'],
            }

            return jsonDatabase.putSchemaTaggedPayload(schemaTaggedPayload)
                .then((result) => {
                    return res.json({
                        ...result,
                        dataChecksum,  // RISKY: this is not a standard return and is not schematized. drift risk
                    })
                })
        }
    })

    function getCreatedAt(maybeContext: any) {
        return maybeContext['createdAt'] == null
            ? Date.now() / 1e3
            : parseFloat(maybeContext['createdAt'] as string)
    }

    async function handleDataTransformationRequest(req: express.Request) {
        let combinedParams = {
            ...req.params,
            ...req.query,
            ...getRawBodyJson(req),
        }
        let {
            dataChecksum,
            transformerName,
        } = combinedParams

        let context = combinedParams['context'] ?? {}
        if (context['createdAt'] == null) {
            context['createdAt'] = getCreatedAt(combinedParams)
        }

        let schemaTaggedPayload: SchemaTaggedPayload = await jsonDatabase.transformPayload(
            transformerName,
            dataChecksum,
            context,
        )

        return schemaTaggedPayload
    }

    app.get('/Transformers/:transformerName/:dataChecksum', async (req: express.Request, res: express.Response) => {
        try {
            let transformed = await handleDataTransformationRequest(req)
            return res.json(transformed)
        } catch (error) {
            return res.json({
                status: 'error',
                message: error,
            })
        }
    })

    app.post('/transformAndStorePayload/:dataChecksum', async (req: express.Request, res: express.Response) => {
        try {
            let schemaTaggedPayload: SchemaTaggedPayload = await handleDataTransformationRequest(req)
            return jsonDatabase.putSchemaTaggedPayload(schemaTaggedPayload)
                .then((result) => {
                    return res.json(result)
                })
        } catch (e) {
            return res.json({
                status: 'error',
                message: e,
            })
        }
    })

    return app.listen(Config.API_SERVER_PORT, () => {
        console.log(`data server running on port ${Config.API_SERVER_PORT}; db: ${databaseServerLocation}`)
    })
}

if (require.main == module) {

    /* example
    let randomData = ['foo', 'bar', 'baz'].map((data, index) => {
        let varyingStructure = index < 2
            ? { oneLevel: 'flat' }
            : { two: { level: 'nested' } }
        return {
            index,
            myText: data,
            ...varyingStructure,
        }
    })
    SchemaStatisticsLoader.autoLoadSingleDataset(randomData)
    // */

    let yargOptions: { [key in keyof IYarguments]: any } = {
        database: {
            type: 'string',
            default: 'memory',
            description: 'path to database',
        },
    }

    const argParser = yargs(hideBin(process.argv)).options(yargOptions)
    const args = argParser.parseSync() as IYarguments

    startWebserver(args)
}