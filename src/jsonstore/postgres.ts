import { canonicalize } from "json-canonicalize";
import { Pool } from 'pg';
import { JsonDatabase } from ".";
import { SchemaTaggedPayload, TypedSchemaTaggedPayload } from '../autogen/interfaces/anthology/2022/06/09/SchemaTaggedPayload';
import { Transformer } from '../autogen/interfaces/anthology/2022/03/30/Transformer';
import { SchemaTaggedPayloadJsonSchemaSchema } from "../autogen/interfaces/SchemaTaggedPayloadJsonSchema";
import {
    JSON_SCHEMAS_TABLE_NAME,
    SCHEMA_TAGGED_PAYLOADS_TABLE_NAME,
    TRANSFORMERS_TABLE_NAME
} from '../defs';
import { bailIfNull } from "../util";


// TODO: consider using Knex?
export class PostgresDatabase extends JsonDatabase {

    static _singleton: PostgresDatabase

    client: Pool

    constructor() {
        super()
        this.client = new Pool()
    }

    static async getSingleton(): Promise<PostgresDatabase> {
        if (PostgresDatabase._singleton == null) {
            PostgresDatabase._singleton = new PostgresDatabase()
            await PostgresDatabase._singleton._setupTables()
        }
        return Promise.resolve(PostgresDatabase._singleton)
    }

    async _setupTables() {
        try {
            await this.client.query(`CREATE TABLE IF NOT EXISTS "${JSON_SCHEMAS_TABLE_NAME}" (title VARCHAR(222), version VARCHAR(99), json JSON, UNIQUE (title, version))`)
            await this.client.query(`CREATE TABLE IF NOT EXISTS "${TRANSFORMERS_TABLE_NAME}" (name VARCHAR(222) PRIMARY KEY, json JSON)`)  // arbitrary length for a "name"
            await this.client.query(`CREATE TABLE IF NOT EXISTS "${SCHEMA_TAGGED_PAYLOADS_TABLE_NAME}" (dataChecksum CHAR(71) PRIMARY KEY, json JSON)`)  // note 71 is for sha256:... only
        } catch (error) {
            console.error('SETUP TABLES ERROR', error)
            throw error
        }
    }

    _insertOne(queryString: string, values: Array<any>) {
        return this.client
            .query(
                queryString,
                values,
            ).then((result) => {
                return {
                    status: 'ok',
                    rowCount: result['rowCount'],
                }
            }).catch((error) => {
                return {
                    status: 'error',
                    message: error['detail'],
                }
            })
    }

    async putSchema(schema: SchemaTaggedPayloadJsonSchemaSchema) {
        let schemaName = bailIfNull(schema['title'], 'title must not be empty')
        let schemaVersion = bailIfNull(schema['version'], 'version must not be empty')
        return this._insertOne(
            `INSERT INTO "${JSON_SCHEMAS_TABLE_NAME}" VALUES ($1, $2, $3)`,
            [schemaName, schemaVersion, schema]
        )
    }

    _getFirstJson<OutputType>(queryString: string, values: Array<any>): Promise<OutputType> {
        return this.client
            .query(queryString, values)
            .then((result) => {
                let firstRow = result.rows?.[0]
                let firstRowJson: any = firstRow['json']
                return firstRowJson as OutputType
            })
            .catch((error) => {
                throw new Error(error.stack)
            })
    }

    async getSchema(schemaName: string, schemaVersion: string = null): Promise<SchemaTaggedPayloadJsonSchemaSchema> {
        return this._getFirstJson<SchemaTaggedPayloadJsonSchemaSchema>(
            `SELECT json FROM "${JSON_SCHEMAS_TABLE_NAME}" WHERE title = $1 ORDER BY version DESC LIMIT 1`,
            [schemaName],
        )
    }

    findLatestMatchingSchema(schemaName: string) {
        return this.getSchema(schemaName)
    }

    async putTransformer(transformerRecord: Transformer) {
        bailIfNull(transformerRecord.name, 'transformer must be named')
        return this._insertOne(
            `INSERT INTO "${TRANSFORMERS_TABLE_NAME}" VALUES ($1, $2)`,
            [transformerRecord.name, canonicalize(transformerRecord)]
        )
    }

    getTransformer(transformerName: string): Promise<Transformer> {
        return this._getFirstJson<Transformer>(
            `SELECT json FROM "${TRANSFORMERS_TABLE_NAME}" WHERE name = $1`,
            [transformerName],
        )
    }

    putSchemaTaggedPayload(schemaTaggedPayload: SchemaTaggedPayload) {
        bailIfNull(schemaTaggedPayload.dataChecksum, 'payload must have precomputed checksum')
        return this._insertOne(
            `INSERT INTO "${SCHEMA_TAGGED_PAYLOADS_TABLE_NAME}" VALUES ($1, $2)`,
            [schemaTaggedPayload.dataChecksum, schemaTaggedPayload]
        )
    }

    getSchemaTaggedPayload(dataChecksum: string): Promise<SchemaTaggedPayload> {
        return this._getFirstJson<SchemaTaggedPayload>(
            `SELECT json FROM "${SCHEMA_TAGGED_PAYLOADS_TABLE_NAME}" WHERE dataChecksum = $1`,
            [dataChecksum],
        )
    }

    findSchemaTaggedPayloads<PayloadInterface>(filterExpression: Record<string, string>): Promise<TypedSchemaTaggedPayload<PayloadInterface>[]> {
        throw new Error('implement me!')
    }
}
