import PouchDB from 'pouchdb'
import express from 'express'
import ExpressPouchDb from 'express-pouchdb'
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
import Ajv from 'ajv';
import Draft04Schema from 'json-metaschema/draft-04-schema.json'
import { getSha256 } from '../src/database';
import { Config, CURRENT_PROTOCOL_VERSION } from '../src/defs';


// get all docs in the db:
// pouchSchemas.allDocs({
//     include_docs: true,
// }).then((results) => {
//     for (const row of results.rows) {
//         console.log(row.doc)
//     }
// })

let pouchSchemas = new PouchDB('schemas', POUCHDB_ADAPTER_CONFIG)
let pouchSchemaTaggedPayloads = new PouchDB('SchemaTaggedPayloads', POUCHDB_ADAPTER_CONFIG)


interface IYarguments {
    database: string,
}

function FIXME_wrapIntoTaggedSchemaPayload(schemaName: string, schemaVersion: string, payload: any): SchemaTaggedPayload {
    return {
        data: payload,
        dataChecksum: `sha256:${getSha256(JSON.stringify(payload))}`,
        protocolVersion: CURRENT_PROTOCOL_VERSION,
        schemaName,
        schemaVersion,
        createdAt: Date.now() / 1e3,
    }
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

export function startWebserver(args: IYarguments = null) {

    const ePdb = ExpressPouchDb(PouchDbConfig, {
        logPath: '/tmp/express-pouchdb.log',  // FIXME
    })
    const app = express()
    app.use('/api', ePdb)
    app.use(express.json({
        verify: (req: express.Request, res: express.Response, buf: Buffer, encoding: string) => {
            // capture raw body
            if (buf && buf.length > 0) {
                req['rawBody'] = buf.toString(encoding || 'utf-8')
            }
        },
    }))

    const POUCHDB_BAD_REQUEST_RESPONSE = {  // this is copied from the error response from posting invalid JSON to express-pouchdb at /api
        error: "bad_request",
        reason: "invalid_json",
    }

    app.post('/schema', async (req: express.Request, res: express.Response) => {
        let unvalidatedPayload: any
        let ajv = getDraft04SchemaValidator()
        try {
            unvalidatedPayload = JSON.parse(req['rawBody'])
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
                    console.log('schema row', row)
                }
            })
            return res.json(response)
        }).catch((error) => {
            console.log(error)
            return res.json(error)
        })
    })

    const FIXME_SCHEMA_TAGGED_PAYLOADS_ENDPOINT = 'SchemaTaggedPayloads'

    app.get(`/${FIXME_SCHEMA_TAGGED_PAYLOADS_ENDPOINT}/:schemaNameMaybeWithVersion`, async (req: express.Request, res: express.Response) => {
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
        }
    })

    app.post(`/${FIXME_SCHEMA_TAGGED_PAYLOADS_ENDPOINT}/:schemaNameMaybeWithVersion`, async (req: express.Request, res: express.Response) => {
        let [schemaName, schemaVersion] = req.params['schemaNameMaybeWithVersion'].split('@')
        console.log(schemaName, schemaVersion)

        // FIXME also match on given version
        let schema = await pouchSchemas.createIndex({
            index: {
                fields: ['version', 'title'],
            }
        }).then(() => {
            return pouchSchemas.find({
                selector: {
                    title: schemaName,
                    ...(schemaVersion == null ? null : {}),
                },
                // can't get this to work yet:
                // Error: Cannot sort on field(s) "version" when using the default index
                // sort: ['version'],
            })
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
                message: 'no such schema',
            })
        }

        let validationResult: ValidationResult
        let unvalidatedPayload = JSON.parse(req['rawBody'])
        try {
            delete schema['$schema']
            console.log(schema)
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
            // TAG HAPPENS HERE
            let schemaTaggedPayload = FIXME_wrapIntoTaggedSchemaPayload(
                schema['title'], schema['version'],
                unvalidatedPayload)
            let hash = getSha256(JSON.stringify(schemaTaggedPayload))
            return pouchSchemaTaggedPayloads.putIfNotExists({
                _id: hash,
                ...schemaTaggedPayload,
            }).then((result) => {
                return res.json(result)
            })
        }
    })

    return app.listen(Config.API_SERVER_PORT, () => {
        console.log(`data server running on port ${Config.API_SERVER_PORT}`)
    })
}

if (require.main == module) {

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