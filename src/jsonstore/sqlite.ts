import { canonicalize } from "json-canonicalize";
import sqlite3 from 'sqlite3';
import { JsonDatabase } from ".";
import { SchemaTaggedPayload } from '../autogen/interfaces/anthology/2022/03/25/SchemaTaggedPayload';
import { Transformer } from '../autogen/interfaces/anthology/2022/03/30/Transformer';
import { SchemaTaggedPayloadJsonSchemaSchema } from "../autogen/interfaces/SchemaTaggedPayloadJsonSchema";
import {
    Config, JSON_SCHEMAS_TABLE_NAME,
    SCHEMA_TAGGED_PAYLOADS_TABLE_NAME,
    TRANSFORMERS_TABLE_NAME
} from '../defs';
import { bailIfNull, getSha256, prefixWithSha256 } from "../util";


// TODO: consider using Knex?
export class SqliteDatabase extends JsonDatabase {

    static _singleton: SqliteDatabase

    database: sqlite3.Database

    constructor() {
        super()
        this.database = new sqlite3.Database(Config.SQLITE_DATABASE_PATH)
    }

    static async getSingleton(): Promise<SqliteDatabase> {
        if (SqliteDatabase._singleton == null) {
            SqliteDatabase._singleton = new SqliteDatabase()
            await SqliteDatabase._singleton._setupTables()
        }
        return Promise.resolve(SqliteDatabase._singleton)
    }

    async runSql(sql: string): Promise<any> {
        return new Promise((resolve, reject) => {
            this.database.run(sql, (error) => {
                if (error) {
                    return reject(error)
                } else {
                    return resolve(true)
                }
            })
        })
    }

    async getWithSql(sql: string): Promise<any> {
        return new Promise((resolve, reject) => {
            this.database.all(sql, (error, rows) => {
                if (error) {
                    return reject(error)
                } else {
                    return resolve(rows)
                }
            })
        })
    }

    async getJsonRecordWithPreparedSql<OutputType>(sql: string, values: Record<string, any>): Promise<OutputType> {
        let query = this.database.prepare(sql)
        return new Promise((resolve, reject) => {
            query.get(values, (error, row) => {
                if (error) {
                    return reject(error)
                }
                if (row?.['json'] == null) {
                    return reject({
                        status: 'error',
                        message: 'did not get json back',
                        sql,
                        values,
                        payload: row,
                    })
                }
                return resolve(JSON.parse(row['json']) as OutputType)
            })
        })
    }

    async putWithPreparedSql(sql: string, values: Record<string, any>) {
        let query = this.database.prepare(sql)
        return new Promise((resolve, reject) => {
            query.run(values, (error) => {
                if (error) {
                    return reject(error)
                }
                return resolve(true)
            })
        })
    }

    async _setupTables() {
        try {
            await this.runSql(`CREATE TABLE IF NOT EXISTS "${JSON_SCHEMAS_TABLE_NAME}" (title TEXT, version TEXT, json TEXT, UNIQUE (title, version) ON CONFLICT REPLACE)`)
            await this.runSql(`CREATE TABLE IF NOT EXISTS "${TRANSFORMERS_TABLE_NAME}" (name TEXT PRIMARY KEY, json TEXT)`)
            await this.runSql(`CREATE TABLE IF NOT EXISTS "${SCHEMA_TAGGED_PAYLOADS_TABLE_NAME}" (dataChecksum TEXT PRIMARY KEY, json TEXT)`)
        } catch (error) {
            console.error('SETUP TABLES ERROR', error)
            throw error
        }
    }

    getTables() {
        return this.getWithSql(`SELECT * FROM sqlite_master`)
    }

    putSchema(schema: SchemaTaggedPayloadJsonSchemaSchema) {
        let schemaName = bailIfNull(schema['title'], 'title must not be empty')
        let schemaVersion = bailIfNull(schema['version'], 'version must not be empty')
        return this.putWithPreparedSql(
            `INSERT INTO "${JSON_SCHEMAS_TABLE_NAME}" VALUES ($title, $version, $json)`,
            {
                $title: schemaName,
                $version: schemaVersion,
                $json: canonicalize(schema),
            }
        )
    }

    async getSchema(schemaName: string, schemaVersion: string = null) {
        return this.getJsonRecordWithPreparedSql<SchemaTaggedPayloadJsonSchemaSchema>(
            `SELECT json FROM "${JSON_SCHEMAS_TABLE_NAME}" WHERE title = $title ORDER BY version DESC LIMIT 1`,
            {
                $title: schemaName,
            },
        )
    }

    findLatestMatchingSchema(schemaName: string) {
        return this.getSchema(schemaName)
    }

    putTransformer(transformerRecord: Transformer) {
        return this.putWithPreparedSql(
            `INSERT INTO "${TRANSFORMERS_TABLE_NAME}" VALUES ($name, $json)`,
            {
                $name: transformerRecord.name,
                $json: canonicalize(transformerRecord),
            }
        )
    }

    getTransformer(transformerName: string): Promise<Transformer> {
        return this.getJsonRecordWithPreparedSql<Transformer>(
            `SELECT json FROM "${TRANSFORMERS_TABLE_NAME}" WHERE name = $name`,
            {
                $name: transformerName,
            }
        )
    }

    putSchemaTaggedPayload(schemaTaggedPayload: SchemaTaggedPayload) {
        bailIfNull(schemaTaggedPayload.dataChecksum, 'payload must have precomputed checksum')
        let canonicalized = canonicalize(schemaTaggedPayload)
        return this.putWithPreparedSql(
            `INSERT INTO "${SCHEMA_TAGGED_PAYLOADS_TABLE_NAME}" VALUES ($dataChecksum, $json)`,
            {
                $dataChecksum: schemaTaggedPayload.dataChecksum,
                $json: canonicalized,
            }
        )
    }

    getSchemaTaggedPayload(dataChecksum: string): Promise<SchemaTaggedPayload> {
        return this.getJsonRecordWithPreparedSql<SchemaTaggedPayload>(
            `SELECT json FROM "${SCHEMA_TAGGED_PAYLOADS_TABLE_NAME}" WHERE dataChecksum = $dataChecksum`,
            {
                $dataChecksum: dataChecksum,
            }
        )
    }
}