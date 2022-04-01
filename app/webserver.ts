import PouchDB from 'pouchdb'
import express from 'express'
import ExpressPouchDb from 'express-pouchdb'
import ExpressFileUpload, { UploadedFile } from 'express-fileupload'
import {
    PouchDbConfig,
    POUCHDB_ADAPTER_CONFIG,
    SchemaStatisticsLoader,
} from '../src/docdb'
import yargs, { Argv } from 'yargs';
import { hideBin } from 'yargs/helpers';
import { validateDataWithSchema, ValidationResult } from '../src/jsvg-lib';
import SchemaTaggedPayloadSchema from '../src/autogen/schemas/anthology/2022/03/25/SchemaTaggedPayloadProtocol.schema.json'
import { SchemaTaggedPayload } from '../src/autogen/interfaces/anthology/2022/03/25/SchemaTaggedPayload'
import { Transformer } from '../src/autogen/interfaces/anthology/2022/03/30/Transformer'
import Ajv from 'ajv';
import Draft04Schema from 'json-metaschema/draft-04-schema.json'
import { getSha256 } from '../src/database';
import {
    Config,
    CURRENT_PROTOCOL_VERSION,
    JSON_SCHEMAS_TABLE_NAME,
    SCHEMA_TAGGED_PAYLOADS_TABLE_NAME,
    TRANSFORMERS_TABLE_NAME,
} from '../src/defs';
import { monkeyPatchConsole } from '../src/util';
import { makeTransformer, TransformerLanguage, unwrapTransformationContext, wrapTransformationContext } from '../src/transformer'
monkeyPatchConsole()


// get all docs in the db:
// pouchSchemas.allDocs({
//     include_docs: true,
// }).then((results) => {
//     for (const row of results.rows) {
//         console.log(row.doc)
//     }
// })

let pouchSchemas = new PouchDB(JSON_SCHEMAS_TABLE_NAME, POUCHDB_ADAPTER_CONFIG)
let pouchTransformers = new PouchDB(TRANSFORMERS_TABLE_NAME, POUCHDB_ADAPTER_CONFIG)
let pouchSchemaTaggedPayloads = new PouchDB(SCHEMA_TAGGED_PAYLOADS_TABLE_NAME, POUCHDB_ADAPTER_CONFIG)

const POUCHDB_BAD_REQUEST_RESPONSE = {  // this is copied from the error response from posting invalid JSON to express-pouchdb at /api
    error: "bad_request",
    reason: "invalid_json",
}

export const FIXME_SchemaHasTitleAndVersion = {
    type: 'object',
    properties: {
        title: {
            type: 'string',
        },
        version: {
            type: 'string',
        },
    },
    required: ['title', 'version'],
}

function toSha256Checksum(data: any) {
    return `sha256:${getSha256(data)}`
}

function stripPouchDbMetadataFields_BANG(record: any): any {
    delete record['_id']
    delete record['_rev']
    return record
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

function findSchema(schemaName: string, schemaVersion: string = null) {
    return pouchSchemas.find({
        selector: {
            title: schemaName,
            ...(schemaVersion == null ? null : {}),
        },
    })
}

async function findLatestMatchingSchema(schemaName: string) {
    return findSchema(schemaName).then((result) => {
        if (result.docs.length > 0) {
            return result.docs[0]
        }
        return null
    })
}

// FIXME MOVEME
export async function transformPayload(
    transformerName: string,
    dataChecksum: string,
    context: any,
): Promise<SchemaTaggedPayload> {
    let transformerRecord = await pouchTransformers.find({
        selector: {
            name: transformerName
        }
    }).then((result) => {
        return (<any>result.docs[0]) as Transformer
    })

    if (transformerRecord == null) {
        throw new Error(`no transformer named ${transformerName}`)
    }

    let payload = await pouchSchemaTaggedPayloads.find({
        selector: {
            dataChecksum: dataChecksum,
        }
    }).then((result) => {
        return (<any>result.docs[0]) as SchemaTaggedPayload
    })

    if (payload == null) {
        throw new Error(`no data with checksum ${dataChecksum}`)
    }

    let outputSchema = await pouchSchemas.find({
        selector: {
            title: transformerRecord.outputSchema,
        }
    }).then((result) => {
        return (<any>result.docs[0])
    })

    if (outputSchema == null) {
        throw new Error(`no output schema matching ${transformerRecord.outputSchema}`)
    }

    let outputSchemaName = outputSchema.title
    let outputSchemaVersion = outputSchema.version

    let transformer = makeTransformer(transformerRecord.language as TransformerLanguage, transformerRecord.sourceCode)

    return transformer.transform(wrapTransformationContext(payload.data, context)).then((transformed) => {
        return unwrapTransformationContext(transformed)
    }).then((unwrapped) => {
        // TAG WRAPPING HAPPENS HERE
        let schemaTaggedPayload: SchemaTaggedPayload = {
            protocolVersion: CURRENT_PROTOCOL_VERSION,
            dataChecksum,
            createdAt: context['createdAt'] ?? Date.now() / 1e3,
            data: unwrapped,
            schemaName: outputSchemaName,
            schemaVersion: outputSchemaVersion,
        }
        return schemaTaggedPayload
    })

}

// this isn't being used downstream anywhere
interface IYarguments {
    database: string,
}

export function startWebserver(args: IYarguments = null) {

    const app = express()
    app.use(ExpressFileUpload())

    const EXPRESS_POUCHDB_PREFIX = '/api'
    const expressPouchDbHandler = ExpressPouchDb(PouchDbConfig, {
        logPath: Config.EXPRESS_POUCHDB_LOG_PATH,
    })

    // hot fix to allow mounting express-pouchdb from non / path
    // ref https://github.com/pouchdb/express-pouchdb/issues/290#issuecomment-265311015
    // app.use(EXPRESS_POUCHDB_PREFIX, expressPouchDbHandler)
    // /*
    app.use((req: express.Request, res: express.Response, next: Function) => {
        let referer = req.header('Referer')
        let refererUrl: URL
        if (referer != null) {
            refererUrl = new URL(referer)
        }
        if (!req.url.startsWith(EXPRESS_POUCHDB_PREFIX)) {
            if (/^\/(?:_utils|_session|_all_dbs|_users)/.test(refererUrl?.pathname || req.url)) {
                return expressPouchDbHandler(req, res)
                // } else if (req.url == '' && refererUrl?.pathname == `${EXPRESS_POUCHDB_PREFIX}/_utils/`) {
                //     // non-working code in attempt to allow loading fauxon from /prefix/
                //     // this doesn't work because the endpoint for resources for fauxson are hard-coded
                //     // in the front-end javascript, and targets /_utils from the root addr
                //     return expressPouchDbHandler(req, res)
            } else {
                return next()
            }
        }
        if (req.url.endsWith('/_utils')) {
            // the pouch handler redirects non-slashed paths to the slashed path,
            // back to the unqualified path (/_utils/), which does NOT have our handler
            return res.redirect(req.originalUrl + '/')
        }
        let originalUrl = req.originalUrl
        req.url = req.originalUrl = originalUrl.substring(EXPRESS_POUCHDB_PREFIX.length)  // [1/2] required for successful inner middleware call
        req.baseUrl = ''  // [2/2] required for successful inner middleware call
        return expressPouchDbHandler(req, res);
    });

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
            await findLatestMatchingSchema(req.body.outputSchema).then((doc) => {
                if (doc == null) {
                    errors.push(`did not find any schema matching output schema "${req.body.outputSchema}"`)
                }
            })
            transformerRecord.outputSchema = req.body.outputSchema
        }
        if (req.body.inputSchemas != null) {
            let inputSchemaNames = req.body.inputSchemas.split(',').map((s: string) => s.trim())
            for (const inputSchemaName of inputSchemaNames) {
                await findLatestMatchingSchema(inputSchemaName).then((doc) => {
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

        return pouchTransformers.put({
            _id: transformerRecord.sourceCodeChecksum,
            ...transformerRecord,
        }).then((response) => {
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
            isValid = ajv.validate(FIXME_SchemaHasTitleAndVersion, unvalidatedPayload)
            if (!isValid) {
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

        let hash = getSha256(JSON.stringify(unvalidatedPayload))
        return pouchSchemas.put({
            _id: hash,
            ...unvalidatedPayload,
        }).then((response) => {
            pouchSchemas.allDocs().then((out) => {
                for (let row of out.rows) {
                    break
                }
            })
            return res.json(response)
        }).catch((error) => {
            console.log(error)
            return res.json(error)
        })
    })

    app.get(`/${SCHEMA_TAGGED_PAYLOADS_TABLE_NAME}/:schemaNameMaybeWithVersion`, async (req: express.Request, res: express.Response) => {
        let [schemaName, schemaVersion] = req.params['schemaNameMaybeWithVersion'].split('@')

        // FIXME also match on given version
        let schema = await pouchSchemaTaggedPayloads.createIndex({
            index: {
                fields: ['version', 'title'],
            }
        }).then(() => {
            return pouchSchemaTaggedPayloads.find({
                selector: {
                    title: schemaName,
                    ...(schemaVersion == null ? null : {}),
                },
                // can't get this to work yet:
                // Error: Cannot sort on field(s) "version" when using the default index
                // sort: ['version'],
            })
        }).then((result) => {
            return result.docs[0]
        })

        if (schema != null) {
            return res.json(stripPouchDbMetadataFields_BANG(schema))
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

        // FIXME also match on given version
        let schema = await pouchSchemas.createIndex({
            index: {
                fields: ['version', 'title'],
            }
        }).then(() => {
            return findSchema(schemaName, schemaVersion)
        }).then((result) => {
            if (result.docs.length > 0) {
                // should pick the latest one!
                let out = result.docs[result.docs.length - 1]
                // FIXME double check this
                stripPouchDbMetadataFields_BANG(out)
                return out
            }
            return null
        })

        if (schema == null) {
            return res.json({
                status: 'error',
                message: `no such schema: ${schemaName}`,
            })
        }

        let validationResult: ValidationResult
        let unvalidatedPayload = getRawBodyJson(req)
        try {
            delete schema['$schema']
            validationResult = await validateDataWithSchema(unvalidatedPayload, schema)
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
                schemaName: schema['title'],
                schemaVersion: schema['version'],
            }
            let hash = getSha256(JSON.stringify(schemaTaggedPayload))
            return pouchSchemaTaggedPayloads.putIfNotExists({
                _id: hash,
                ...schemaTaggedPayload,
            }).then((result) => {
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

        let schemaTaggedPayload: SchemaTaggedPayload = await transformPayload(
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
                message: error.toString(),
            })
        }
    })

    app.post('/transformPayload/:dataChecksum', async (req: express.Request, res: express.Response) => {
        try {
            let schemaTaggedPayload: SchemaTaggedPayload = await handleDataTransformationRequest(req)
            let hash = getSha256(JSON.stringify(schemaTaggedPayload))
            return pouchSchemaTaggedPayloads.putIfNotExists({
                _id: hash,
                ...schemaTaggedPayload,
            }).then((result) => {
                return res.json(result)
            })
        } catch (e) {
            return res.json({
                status: 'error',
                message: e.toString(),
            })
        }
    })

    return app.listen(Config.API_SERVER_PORT, () => {
        console.log(`data server running on port ${Config.API_SERVER_PORT}`)
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