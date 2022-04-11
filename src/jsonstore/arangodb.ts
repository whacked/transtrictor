import { Database } from 'arangojs'
import { AqlQuery } from 'arangojs/aql'
import { DocumentCollection } from 'arangojs/collection'
import { SchemaTaggedPayload } from '../autogen/interfaces/anthology/2022/03/25/SchemaTaggedPayloadProtocol'
import { Transformer } from '../autogen/interfaces/anthology/2022/03/30/Transformer'
import { Config, CURRENT_PROTOCOL_VERSION, JSON_SCHEMAS_TABLE_NAME, SCHEMA_TAGGED_PAYLOADS_TABLE_NAME, TRANSFORMERS_TABLE_NAME } from '../defs'
import { JsonDatabase } from '.'
import { makeTransformer, TransformerLanguage, unwrapTransformationContext, wrapTransformationContext } from '../transformer'
import { getJcsSha256, toSha256Checksum } from '../util'
import { SchemaTaggedPayloadJsonSchemaSchema } from '../autogen/interfaces/SchemaTaggedPayloadJsonSchema'
import { TypedSchemaTaggedPayload } from '../autogen/interfaces/anthology/2022/03/25/SchemaTaggedPayload'


export function stripArangoDbMetadataFields_BANG(record: any): any {
    if (record == null) {
        return record
    }
    delete record['_id']
    delete record['_rev']
    delete record['_key']
    return record
}



export class ArangoDatabase extends JsonDatabase {

    database: Database

    schemas: DocumentCollection<SchemaTaggedPayloadJsonSchemaSchema>
    transformers: DocumentCollection<Transformer>
    schemaTaggedPayloads: DocumentCollection<SchemaTaggedPayload>

    async _ensureCollection(collectionName: string): Promise<DocumentCollection<any>> {
        let collection = this.database.collection(collectionName)
        return collection.exists().then((isCollectionExist) => {
            if (isCollectionExist) {
                return collection
            } else {
                return this.database.createCollection(collectionName)
            }
        })
        // try {
        //     return await this._db.createCollection(collectionName)
        // } catch (error) {
        //     if (error.errorNum == 1207 && error.response.body.errorMessage == 'duplicate name') {
        //         console.warn(`collection "${collectionName}" exists; ignoring...`)
        //     }
        // }
    }

    async setupCollections() {
        this.schemas = await this._ensureCollection(JSON_SCHEMAS_TABLE_NAME)
        this.transformers = await this._ensureCollection(TRANSFORMERS_TABLE_NAME)
        this.schemaTaggedPayloads = await this._ensureCollection(SCHEMA_TAGGED_PAYLOADS_TABLE_NAME)
        return true
    }

    static _singleton: ArangoDatabase
    static async getSingleton(): Promise<ArangoDatabase> {
        // this is mainly to ensure the async setupCollections function gets
        // called immediately, and waited, so subsequent db operations work.
        // there are other patterns like the "readiness pattern"
        // see https://stackoverflow.com/questions/35743426/async-constructor-functions-in-typescript
        // but this one is simple enough

        if (ArangoDatabase._singleton == null) {
            ArangoDatabase._singleton = new ArangoDatabase()
            await ArangoDatabase._singleton.setupCollections()
        }
        return Promise.resolve(ArangoDatabase._singleton)
    }

    constructor() {
        super()
        this.database = new Database({
            url: Config.ARANGODB_SERVER_URL,
            // if you don't create a database, it will default to "_system", the initial database
            // right now, we are ok with this arrangement.
            // databaseName: "example",
            auth: {
                username: Config.ARANGODB_AUTH_USERNAME,
                password: Config.ARANGODB_AUTH_PASSWORD,
            }
        })

        this.database.collection
        // this.setupCollections()
    }

    _queryAndGetFirstResult(query: AqlQuery): Promise<any> {
        return this.database.query(query).then((cursor) => {
            if (cursor.hasNext) {
                return cursor.next()
            }
        }).then((record) => {
            let doc = stripArangoDbMetadataFields_BANG(record)
            return doc
        })
    }

    _findInCollectionByKey(collectionName: string, key: string) {
        return this._queryAndGetFirstResult({
            query: `RETURN DOCUMENT(@key)`,
            bindVars: {
                key: key,
            },
        })
    }

    async getSchemaTaggedPayloadByKey(key: string = null) {
        return this._queryAndGetFirstResult({
            query: `RETURN DOCUMENT(@key)`,
            bindVars: {
                key: `${SCHEMA_TAGGED_PAYLOADS_TABLE_NAME}/${key}`,
            },
        })
    }

    async getSchemaTaggedPayload(dataChecksum: string) {
        return this._queryAndGetFirstResult({
            query: `FOR payload IN \`schema-tagged-payloads\` FILTER payload.dataChecksum == @dataChecksum RETURN payload`,
            bindVars: {
                dataChecksum: dataChecksum,
            }
        })
    }

    addSchemaTaggedPayload(payload: any) {
        let hash = getJcsSha256(payload)
        let documents = [
            {
                _key: hash,
                ...payload,
            }
        ]
        return this.schemaTaggedPayloads.import(documents)
    }

    putTransformer(transformerRecord: Transformer) {
        return this.transformers.import([
            {
                _key: transformerRecord.sourceCodeChecksum,
                ...transformerRecord,
            }
        ])
    }

    getTransformer(transformerName: string) {
        return this._queryAndGetFirstResult({
            query: `FOR transformer IN \`transformers\` FILTER transformer.name == @name RETURN transformer`,
            bindVars: {
                name: transformerName,
            }
        })
    }

    putSchema(schema: any) {
        let hash = getJcsSha256(schema)
        return this.schemas.import([
            {
                _key: hash,
                ...schema,
            }
        ])
    }

    putSchemaTaggedPayload(schemaTaggedPayload: any) {
        let hash = getJcsSha256(schemaTaggedPayload)
        return this.schemaTaggedPayloads.import([
            {
                _key: hash,
                ...schemaTaggedPayload,
            }
        ])
    }

    async getSchema(schemaName: string, schemaVersion: string = null) {
        return this._findSchema(schemaName)
    }

    _findSchema(schemaName: string, schemaVersion: string = null) {
        // TODO do something with version
        return this._queryAndGetFirstResult({
            query: `FOR schema IN \`json-schemas\` FILTER schema.title == @title SORT schema.version DESC RETURN schema`,
            bindVars: {
                title: schemaName,
            }
        })
    }

    findLatestMatchingSchema(schemaName: string) {
        return this._findSchema(schemaName)
    }

    findSchemaTaggedPayloads<PayloadInterface>(filterExpression: Record<string, string>): Promise<TypedSchemaTaggedPayload<PayloadInterface>[]> {
        throw new Error('implement me!')
    }
}