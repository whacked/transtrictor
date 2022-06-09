import { canonicalize } from "json-canonicalize";
import { JsonDatabase } from ".";
import { SchemaTaggedPayload, TypedSchemaTaggedPayload } from '../autogen/interfaces/anthology/2022/06/09/SchemaTaggedPayload';
import { Transformer } from '../autogen/interfaces/anthology/2022/03/30/Transformer';
import { SchemaTaggedPayloadJsonSchemaSchema } from "../autogen/interfaces/SchemaTaggedPayloadJsonSchema";
import {
    Config, JSON_SCHEMAS_TABLE_NAME,
    SCHEMA_TAGGED_PAYLOADS_TABLE_NAME,
    TRANSFORMERS_TABLE_NAME
} from '../defs';
import { bailIfNull, getSha256, prefixWithSha256 } from "../util";
import { DataApiClient } from 'rqlite-js'


// TODO: consider using Knex?
export class RqliteDatabase extends JsonDatabase {

    static _singleton: RqliteDatabase

    client: DataApiClient

    constructor() {
        super()
        this.client = new DataApiClient(Config.RQLITE_SERVER_ADDRESS)
    }

    async _setupTables() {
        for (const initializerStatement of [
            `CREATE TABLE IF NOT EXISTS "${JSON_SCHEMAS_TABLE_NAME}" (title TEXT, version TEXT, json TEXT, UNIQUE (title, version) ON CONFLICT REPLACE)`,
            `CREATE TABLE IF NOT EXISTS "${TRANSFORMERS_TABLE_NAME}" (name TEXT PRIMARY KEY, json TEXT)`,
            `CREATE TABLE IF NOT EXISTS "${SCHEMA_TAGGED_PAYLOADS_TABLE_NAME}" (dataChecksum TEXT PRIMARY KEY, json TEXT)`,
        ]) {
            let dataResults = await this.client.execute(initializerStatement)
            if (dataResults.hasError()) {
                const error = dataResults.getFirstError()
                console.error(error, 'rqlite create tables error')
                throw error
            }
        }
    }

    static async getSingleton(): Promise<RqliteDatabase> {
        if (RqliteDatabase._singleton == null) {
            RqliteDatabase._singleton = new RqliteDatabase()
            await RqliteDatabase._singleton._setupTables()
        }
        return Promise.resolve(RqliteDatabase._singleton)
    }

    async _query(sql) {
        let dataResults = await this.client.query(sql)
        if (dataResults.hasError()) {
            const error = dataResults.getFirstError()
            console.error(error, 'failure on rqlite query')
            throw error
        }
        return dataResults.results
    }

    getTables() {
        return this._query(`SELECT * FROM sqlite_master`)
    }

    async _bailIfResultHasErrors(dataResultsPromise: Promise<any>) {
        let dataResults = await dataResultsPromise
        if (dataResults.hasError()) {
            const error = dataResults.getFirstError()
            console.error(error, 'failure on rqlite query')
            throw error
        }
        return dataResults
    }

    async _queryParameterized<T>(sql: string, parameters: Record<string, string>): Promise<Array<T>> {
        return this._bailIfResultHasErrors(this.client.query([[
            sql, parameters
        ]])).then((dataResults) => {
            return dataResults.results.map(dr => dr.data)
        })
    }

    async _executeParameterized(sql: string, parameters: Record<string, string>) {
        return this._bailIfResultHasErrors(this.client.execute([[
            sql, parameters
        ]]))
    }

    putSchema(schema: SchemaTaggedPayloadJsonSchemaSchema) {
        let schemaName = bailIfNull(schema['title'], 'title must not be empty')
        let schemaVersion = bailIfNull(schema['version'], 'version must not be empty')
        return this._executeParameterized(
            `INSERT OR IGNORE INTO "${JSON_SCHEMAS_TABLE_NAME}"(title, version, json) VALUES (:title, :version, :json)`,
            {
                title: schemaName,
                version: schemaVersion,
                json: canonicalize(schema),
            }
        )
    }

    async getSchema(schemaName: string, schemaVersion: string = null): Promise<SchemaTaggedPayloadJsonSchemaSchema> {
        return this._queryParameterized<Record<string, string>>(
            `SELECT json FROM "${JSON_SCHEMAS_TABLE_NAME}" WHERE title = :title ORDER BY version DESC LIMIT 1`,
            {
                title: schemaName,
            },
        ).then((results) => {
            if (results.length == 0) {
                return null
            } else {
                return JSON.parse(results[0].json) as SchemaTaggedPayloadJsonSchemaSchema
            }
        })
    }

    async findLatestMatchingSchema(schemaName: string) {
        return this.getSchema(schemaName)
    }

    putTransformer(transformerRecord: Transformer) {
        return this._executeParameterized(
            `INSERT OR IGNORE INTO "${TRANSFORMERS_TABLE_NAME}"(name, json) VALUES (:name, :json)`,
            {
                name: transformerRecord.name,
                json: canonicalize(transformerRecord),
            }
        )
    }

    async getTransformer(transformerName: string): Promise<Transformer> {
        return this._queryParameterized<Record<string, string>>(
            `SELECT json FROM "${TRANSFORMERS_TABLE_NAME}" WHERE name = :name`,
            {
                name: transformerName,
            }
        ).then((results) => {
            if (results.length == 0) {
                return null
            } else {
                return JSON.parse(results[0].json) as Transformer
            }
        })
    }

    putSchemaTaggedPayload(schemaTaggedPayload: SchemaTaggedPayload) {
        bailIfNull(schemaTaggedPayload.dataChecksum, 'payload must have precomputed checksum')
        let canonicalized = canonicalize(schemaTaggedPayload)
        return this._executeParameterized(
            `INSERT OR IGNORE INTO "${SCHEMA_TAGGED_PAYLOADS_TABLE_NAME}"(dataChecksum, json) VALUES (:dataChecksum, :json)`,
            {
                dataChecksum: schemaTaggedPayload.dataChecksum,
                json: canonicalized,
            }
        )
    }

    async getSchemaTaggedPayload(dataChecksum: string): Promise<SchemaTaggedPayload> {
        return this._queryParameterized<Record<string, string>>(
            `SELECT json FROM "${SCHEMA_TAGGED_PAYLOADS_TABLE_NAME}" WHERE dataChecksum = :dataChecksum`,
            {
                dataChecksum: dataChecksum,
            }
        ).then((results) => {
            if (results.length == 0) {
                return null
            } else {
                return JSON.parse(results[0].json) as SchemaTaggedPayload
            }
        })
    }

    findSchemaTaggedPayloads<PayloadInterface>(filterExpression: Record<string, string>): Promise<TypedSchemaTaggedPayload<PayloadInterface>[]> {
        throw new Error('implement me!')
    }
}
