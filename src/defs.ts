export const SCHEMA_TABLE_NAME = 'schemas'

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
