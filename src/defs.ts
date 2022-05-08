import { TranstrictorLocalDotEnvConfigSchema } from './autogen/interfaces/TranstrictorLocalDotEnvConfig'
import TranstrictorLocalDotEnvConfigJsonSchema from './autogen/schemas/TranstrictorLocalDotEnvConfig.schema.json'
import { ValidatedConfig } from 'schematized-config/ValidatedConfig'

// DEPRECATE???
export const GENERIC_DATASETS_TABLE_NAME = 'datasets'
export const SCHEMAS_TABLE_NAME = 'schemas'

// merge with STP?
export const JSON_SCHEMAS_TABLE_NAME = 'json-schemas'  // 'JsonSchemas'
export const TRANSFORMERS_TABLE_NAME = 'transformers'  // 'Transformers'
export const SCHEMA_TAGGED_PAYLOADS_TABLE_NAME = 'schema-tagged-payloads'  // 'SchemaTaggedPayloads'
export const CURRENT_PROTOCOL_VERSION = '2022-03-25.1'


export type sha256HexString = string

export interface SchemaStatistic {
    firstAppearedAt: any,
    lastAppearedAt?: any,
    total: number,
    schemaHash: string,
    sourceCode: string,
    databaseName: string,

    // @types/pouchdb-core
    dbRecord?: {
        id: PouchDB.Core.DocumentId,
        key: PouchDB.Core.DocumentKey,
        value: {
            rev: PouchDB.Core.RevisionId,
            deleted?: boolean | undefined,
        }
    },
}

export interface ExtendedResponse {
    schemaHash: string,
    data: any,
}


export const Config = ValidatedConfig.setSchema(TranstrictorLocalDotEnvConfigJsonSchema).loadDotEnvFile<TranstrictorLocalDotEnvConfigSchema>()