import { JsonDatabase } from "./jsonstore"
import PouchDB from 'pouchdb'
import {
    Config,
    CURRENT_PROTOCOL_VERSION,
    JSON_SCHEMAS_TABLE_NAME,
    SCHEMA_TAGGED_PAYLOADS_TABLE_NAME,
    TRANSFORMERS_TABLE_NAME,
} from './defs';
import { POUCHDB_ADAPTER_CONFIG } from "./docdb";
import { SchemaTaggedPayload } from './autogen/interfaces/anthology/2022/03/25/SchemaTaggedPayload'
import {
    makeTransformer,
    TransformerLanguage,
    unwrapTransformationContext,
    wrapTransformationContext,
} from "./transformer";
import { Transformer } from './autogen/interfaces/anthology/2022/03/30/Transformer'
import { getJcsSha256, toSha256Checksum } from "./util";


// get all docs in the db:
// pouchSchemas.allDocs({
//     include_docs: true,
// }).then((results) => {
//     for (const row of results.rows) {
//         console.log(row.doc)
//     }
// })


function stripPouchDbMetadataFields_BANG(record: any): any {
    delete record['_id']
    delete record['_rev']
    return record
}

export class PouchDatabase extends JsonDatabase {

    schemas: PouchDB.Database
    transformers: PouchDB.Database
    schemaTaggedPayloads: PouchDB.Database

    constructor() {
        super()
        if (Config.COUCHDB_SERVER_URL != null) {
            const authConfig = {
                auth: {
                    username: Config.COUCHDB_AUTH_USERNAME,
                    password: Config.COUCHDB_AUTH_PASSWORD,
                }
            }
            this.schemas = new PouchDB(Config.COUCHDB_SERVER_URL + '/' + JSON_SCHEMAS_TABLE_NAME, authConfig)
            this.transformers = new PouchDB(Config.COUCHDB_SERVER_URL + '/' + TRANSFORMERS_TABLE_NAME, authConfig)
            this.schemaTaggedPayloads = new PouchDB(Config.COUCHDB_SERVER_URL + '/' + SCHEMA_TAGGED_PAYLOADS_TABLE_NAME, authConfig)

        } else {
            this.schemas = new PouchDB(JSON_SCHEMAS_TABLE_NAME, POUCHDB_ADAPTER_CONFIG)
            this.transformers = new PouchDB(TRANSFORMERS_TABLE_NAME, POUCHDB_ADAPTER_CONFIG)
            this.schemaTaggedPayloads = new PouchDB(SCHEMA_TAGGED_PAYLOADS_TABLE_NAME, POUCHDB_ADAPTER_CONFIG)
        }
    }

    putTransformer(transformerRecord: Transformer) {
        return this.transformers.put({
            _id: transformerRecord.sourceCodeChecksum,
            ...transformerRecord,
        })
    }

    putSchema(schema: any) {
        let hash = getJcsSha256(schema)
        return this.schemas.put({
            _id: hash,
            ...schema,
        }).then((response) => {
            this.schemas.allDocs().then((out) => {
                for (let row of out.rows) {
                    break
                }
            })
            return response
        })
    }

    putSchemaTaggedPayload(schemaTaggedPayload: any) {
        let hash = getJcsSha256(schemaTaggedPayload)
        return this.schemaTaggedPayloads.putIfNotExists({
            _id: hash,
            ...schemaTaggedPayload,
        })
    }

    async getSchema(schemaName: string, schemaVersion: string = null) {
        // FIXME also match on given version
        let schema = await this.schemas.createIndex({
            index: {
                fields: ['version', 'title'],
            }
        }).then(() => {
            return this.schemas.find({
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

        if (schema == null) {
            return null
        }
        return stripPouchDbMetadataFields_BANG(schema)
    }

    _findSchema(schemaName: string, schemaVersion: string = null) {
        return this.schemas.find({
            selector: {
                title: schemaName,
                ...(schemaVersion == null ? null : {}),
            },
        })
    }

    async findLatestMatchingSchema(schemaName: string) {
        return this._findSchema(schemaName).then((result) => {
            if (result.docs.length > 0) {
                return result.docs[0]
            }
            return null
        })
    }

    async transformPayload(
        transformerName: string,
        dataChecksum: string,
        context: any,
    ): Promise<SchemaTaggedPayload> {
        let transformerRecord = await this.transformers.createIndex({
            index: {
                fields: ['name'],
            }
        }).then(() => {
            return this.transformers.find({
                selector: {
                    name: transformerName
                }
            })
        }).then((result) => {
            return (<any>result.docs[0]) as Transformer
        })

        if (transformerRecord == null) {
            throw new Error(`no transformer named ${transformerName}`)
        }
        if (transformerRecord.outputSchema == null) {
            throw new Error(`transformer ${transformerName} has no output schema`)
        }

        let payload = await this.schemaTaggedPayloads.createIndex({
            index: {
                fields: ['dataChecksum'],
            }
        }).then(() => {
            return this.schemaTaggedPayloads.find({
                selector: {
                    dataChecksum: dataChecksum,
                }
            })
        }).then((result) => {
            if (result.docs.length > 1) {
                throw new Error(`data checksum not unique! found ${result.docs.length} for checksum ${dataChecksum}`)
            }
            return (<any>result.docs[0]) as SchemaTaggedPayload
        })

        if (payload == null) {
            throw new Error(`no data with checksum ${dataChecksum}`)
        }

        let outputSchema = await this.schemas.find({
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
            return unwrapTransformationContext<SchemaTaggedPayload>(transformed)
        }).then((unwrapped) => {
            const transformedDataChecksum = toSha256Checksum(unwrapped.data)
            // TAG WRAPPING HAPPENS HERE
            let schemaTaggedPayload: SchemaTaggedPayload = {
                protocolVersion: CURRENT_PROTOCOL_VERSION,
                dataChecksum: transformedDataChecksum,  // TODO test that post-transform checksum != input checksum (unless fixed point!?)
                createdAt: context['createdAt'] ?? Date.now() / 1e3,
                data: unwrapped.data,
                schemaName: outputSchemaName,
                schemaVersion: outputSchemaVersion,
            }
            return schemaTaggedPayload
        })

    }
}