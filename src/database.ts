import * as fs from 'fs'
import * as path from 'path'
import * as KnexLib from 'knex'
import * as col from 'colorette'
import Knex from 'knex'
import { JSONSchema } from '@apidevtools/json-schema-ref-parser'
import memoizerific from 'memoizerific'
import crypto from 'crypto'
import DatabaseJoinSpec from './autogen/databaseJoinSpec.json'
import { CacheableInputSourceSchema } from './autogen/interfaces/CacheableInputSource'
import { CacheableDataResultSchema } from './autogen/interfaces/CacheableDataResult'
import { JsonSchemaRecordSchema } from './autogen/interfaces/JsonSchemaRecord'
import { canonicalize } from 'json-canonicalize'
import CacheableInputSource from './autogen/schemas/CacheableInputSource.schema.json'
import CacheableDataResult from './autogen/schemas/CacheableDataResult.schema.json'
import JsonSchemaRecord from './autogen/schemas/JsonSchemaRecord.schema.json'
import { unflatten } from 'flat'
import { validateDataWithSchema } from './jsvg-lib'
import { slurp } from './util'
import { Transformer, unwrapTransformationContext, wrapTransformationContext } from './transformer'
import fastGlob from 'fast-glob'


const AUTOGEN_SCHEMAS_DIRECTORY = path.join(path.dirname(__filename), 'autogen/schemas')
if (!fs.existsSync(AUTOGEN_SCHEMAS_DIRECTORY)) {
    throw new Error('autogen schemas directory does not exist; expected it to be in ' + AUTOGEN_SCHEMAS_DIRECTORY)
}

export const TableMapping = {
    CacheableInputSource,
    CacheableDataResult,
    JsonSchemaRecord,
}

export interface DefaultTables {
    CacheableInputSource: CacheableInputSourceSchema,
    CacheableDataResult: CacheableDataResultSchema,
    JsonSchemaRecord: JsonSchemaRecordSchema,
}

export type DefaultTableNames = keyof DefaultTables

type SourceTableName = string;
type TargetTableName = string;
type FromToColumnPair = Array<string>
export type JoinSpec = Record<SourceTableName, Record<TargetTableName, FromToColumnPair>>;


export function getColumnsFromJsonSchema(jsonSchema: any, excludeColumns: Iterable<string> = null, shouldAutoConvertRefs: boolean = true): Array<string> {
    let excludeColumnsSet = excludeColumns == null ? null : new Set(excludeColumns)
    // console.log(excludeColumnsSet)
    let out = []
    for (const key of Object.keys(jsonSchema.properties)) {
        let prop = jsonSchema.properties[key]
        let columnName: string
        if (prop['$ref'] != null && shouldAutoConvertRefs) {
            columnName = `${key}_id`
        } else {
            columnName = key
        }
        if (excludeColumnsSet != null && excludeColumnsSet.has(columnName)) {
            continue
        }
        out.push(columnName)
    }
    return out
}

export function getKnexSelectSpecification(querySpec: any) {
    // let selectColumns: Array<string> = []
    let selectObject: Record<string, string> = {}
    for (const tableName of Object.keys(querySpec)) {
        for (const maybeColumnName of querySpec[tableName]) {
            if (typeof maybeColumnName === 'string') {
                let qualifiedColumnName = `${tableName}.${maybeColumnName}`
                // selectColumns.push(`${qualifiedColumnName} AS ${qualifiedColumnName}`)
                selectObject[qualifiedColumnName] = qualifiedColumnName
            } else {
                // selectColumns = selectColumns.concat(getKnexSelectSpecification(maybeColumnName))
                selectObject = {
                    ...selectObject,
                    ...getKnexSelectSpecification(maybeColumnName),
                }
            }
        }
    }
    // return selectColumns
    return selectObject
}


function failIfNotExists(path: string) {
    if (!fs.existsSync(path)) {
        throw new Error(`given file "${path} does not exist`)
    }
    return path
}

export class KnexQueryable {
    public readonly config: KnexLib.Knex.Config
    public readonly knex: KnexLib.Knex

    constructor(configOrObject: KnexLib.Knex.Config | KnexLib.Knex, public readonly joinSpec: JoinSpec = {}) {
        if ((<any>configOrObject).context != null) {
            this.knex = <KnexLib.Knex>configOrObject
        } else if ((<KnexLib.Knex.Config>configOrObject).connection != null) {
            this.config = configOrObject
            this.knex = Knex(this.config)
        } else {
            console.warn(configOrObject)
            throw new Error(`could not initialize knex with input`)
        }
    }

    expandQuery(
        querySpec: any,
        rootTableName: string = null,
        knexQueryBuilder: KnexLib.Knex.QueryBuilder = null,
        indent: string = ''
    ): KnexLib.Knex.QueryBuilder {
        if (rootTableName == null) {
            rootTableName = Object.keys(querySpec)[0]
        }
        if (rootTableName == null) {
            throw new Error('received query spec has no root table')
        }
        if (knexQueryBuilder === null) {
            knexQueryBuilder = this.knex(rootTableName).select(getKnexSelectSpecification(querySpec))
        }

        for (const joinQuerySpec of Object.values(querySpec[rootTableName]).filter(
            maybeJoinQuerySpec => typeof maybeJoinQuerySpec === 'object'
        )) {
            let targetTableName = Object.keys(joinQuerySpec)[0]
            let joinRule = this.joinSpec[rootTableName][targetTableName]
            if (joinRule == null) {
                throw new Error(`no join rule for ${rootTableName} --> ${targetTableName}`)
            }
            let [rootColumnName, targetColumnName] = joinRule
            console.debug(`${indent} > `, rootTableName, '--->', targetTableName, 'via', `${rootTableName}.${rootColumnName}`, '--->', `${targetTableName}.${targetColumnName}`)

            let knexQueryBuilderJoined = knexQueryBuilder.leftOuterJoin(
                targetTableName,
                `${rootTableName}.${rootColumnName}`, '=', `${targetTableName}.${targetColumnName}`
            )
            knexQueryBuilder = this.expandQuery(
                joinQuerySpec,
                targetTableName,
                knexQueryBuilderJoined,
                indent + '    ',
            )
        }

        return knexQueryBuilder
    }
}

export class KnexSqliteQueryable extends KnexQueryable {

    constructor(filename: string = ':memory:', joinSpec: JoinSpec = {}) {  // or e.g. /path/to/app.dev.db
        super({
            client: 'sqlite3',
            connection: {
                filename: failIfNotExists(filename),
            },
            useNullAsDefault: true,  // fixes TypeError: `sqlite` does not support inserting default values. Specify values explicitly or use the `useNullAsDefault` config flag.
        }, joinSpec)
    }
}

export function hotPatchSchemaWithNullableFields(schemaObject: any, nullableFields: Array<string>) {
    for (const fieldName of nullableFields) {
        let currentFieldType = schemaObject.properties[fieldName]['type']
        if (Array.isArray(currentFieldType)) {
            currentFieldType.push('null')
            schemaObject.properties[fieldName]['type'] = currentFieldType
        } else {
            schemaObject.properties[fieldName]['type'] = [
                currentFieldType, 'null',
            ]
        }
    }
}

export async function jsonSchemaToTableCreator(
    knexInstance: KnexLib.Knex,
    jsonSchema: JSONSchema,
): Promise<KnexLib.Knex.SchemaBuilder> {
    let propertyNames = Object.keys(jsonSchema.properties)
    let tableName = jsonSchema.title ?? 'NoName'
    return knexInstance.schema.hasTable(tableName).then((tableExists) => {
        if (tableExists) {
            return null
        } else {
            let createTableCommand = knexInstance.schema.createTable(
                tableName,
                (table) => {

                    for (let i = 0; i < propertyNames.length; ++i) {
                        let propertyName = propertyNames[i]

                        if (propertyName == 'id') {  // treat primary key
                            table.increments(propertyName).primary()
                        } else if (propertyName.endsWith('_id')) {  // treat as join column
                            table.integer(propertyName)
                        } else if (propertyName == 'sha256') {  // treat as unique
                            table.string(propertyName, 32).unique()
                        } else if (propertyName == 'sourcePath') {  // treat as unique
                            table.string(propertyName).unique()
                        } else {
                            let propDefinition = jsonSchema.properties[propertyName]
                            switch (propDefinition['type']) {
                                case 'integer':
                                    table.integer(propertyName)
                                    break
                                case 'number':
                                    table.float(propertyName)
                                    break
                                case 'string':
                                    table.text(propertyName)
                                    break
                                case 'boolean':
                                    table.boolean(propertyName)
                                    break
                            }
                        }
                    }
                    return table
                }
            )
            console.debug(`- create table command for ${tableName}`)
            console.debug(createTableCommand.toSQL())
            return createTableCommand
        }
    })
}

export interface IForeignKey {
    foreignTableName: string,
    foreignKey: string,
    localTableName: string,
    localKey: string,
}

export function extractForeignKeys(jsonSchema: JSONSchema): Array<IForeignKey> {
    return Object.keys(jsonSchema.properties).filter((key) => {
        return key.endsWith('_id')
    }).map((key) => {
        let matches = key.match(/(.+?)_(id)$/)
        let fKeySpec: IForeignKey = {
            foreignTableName: matches[1],
            foreignKey: matches[2],
            localTableName: jsonSchema.title,
            localKey: key,
        }
        return fKeySpec
    })
}

export async function generateTablesFromSchemas(knexInstance: KnexLib.Knex, jsonSchemas: Array<JSONSchema>) {
    let foreignKeysToProcess: Array<IForeignKey> = []
    let processedTables: Record<string, any> = {}

    for (const schemaData of jsonSchemas) {
        let createTableCommand = await jsonSchemaToTableCreator(knexInstance, schemaData)
        if (createTableCommand == null) {
            continue
        }
        processedTables[schemaData.title] = createTableCommand
        foreignKeysToProcess = foreignKeysToProcess.concat(extractForeignKeys(schemaData))
    }

    let foreignKeyCommands = []
    for (const foreignKey of foreignKeysToProcess) {
        if (processedTables[foreignKey.foreignTableName] == null) {
            console.warn(col.magenta(`skipping table with no schema: ${foreignKey.foreignTableName}`))
            continue
        }
        let foreignKeyConstraintCommand = knexInstance.schema.alterTable(foreignKey.localTableName, (table) => {
            table.foreign(foreignKey.localKey).references(`${foreignKey.foreignTableName}.${foreignKey.foreignKey}`)
        })

        console.debug(`- foreign key joining ${foreignKey.localTableName}.${foreignKey.localKey} --> ${foreignKey.foreignTableName}.${foreignKey.foreignKey}:`)
        console.info(foreignKey)
        console.debug(foreignKeyConstraintCommand.toSQL())

        foreignKeyCommands.push(foreignKeyConstraintCommand)
    }

    let foreignKeyResults = await Promise.all(foreignKeyCommands)

    return {
        processedTables,
        foreignKeyResults,
    }
}

type sha256HexString = string


export const getSha256 = memoizerific(1000)((content: string): sha256HexString => {
    return crypto.createHash('sha256').update(content).digest('hex')
})

export class KnexDbInterface {

    knexQueryable: KnexQueryable
    getOrCreateJsonSchema: (jsonSchemaSource: string) => Promise<sha256HexString>

    static getObjectHash(obj: any): string {
        let canonicalJson = canonicalize(obj)
        return getSha256(canonicalJson)
    }

    constructor(private readonly knexInstance: KnexLib.Knex) {
        const joinSpec: JoinSpec = DatabaseJoinSpec
        this.knexQueryable = new KnexQueryable(this.knexInstance, joinSpec)

        this.getOrCreateJsonSchema = memoizerific(50)(async (jsonSchemaSource: string): Promise<sha256HexString> => {
            let hash: sha256HexString = getSha256(jsonSchemaSource)
            return this.knexQueryable.expandQuery({

            })
        })
    }
}

export function loadEnvDefinedDatabase(databaseName?: string): KnexLib.Knex {
    require('dotenv').config()
    if (databaseName == null) {
        databaseName = process.env.DATABASE_NAME
    }
    if (databaseName == null) {
        console.warn('WARN: no database in DATABASE_NAME envvar/.env; fallback to memory')
        databaseName = ':memory:'
    }
    console.info(`loading database: ${databaseName}`)
    return Knex({
        client: 'sqlite3',
        connection: {
            filename: databaseName,
        },
        useNullAsDefault: true,  // fixes TypeError: `sqlite` does not support inserting default values. Specify values explicitly or use the `useNullAsDefault` config flag.
    })
}

export function getDatabaseModelsJsonSchemas() {
    // NOTE: there's a new "anthology" directory in autogen schema
    // which is not processed here
    return fastGlob.sync([path.join(`${AUTOGEN_SCHEMAS_DIRECTORY}/*.json`)]).map((schemaFilePath) => {
        console.log(`processing ${col.blue(schemaFilePath)}...`)
        let schemaFileName = path.basename(schemaFilePath)
        let schemaData = JSON.parse(slurp(schemaFilePath)) as JSONSchema
        if (schemaData.title == null) {
            schemaData.title = schemaFileName.split('.')[0]
        }
        return schemaData
    })
}

export async function ensureHashableObjectInDatabase(
    knexDbi: KnexDbInterface,
    tableName: DefaultTableNames,
    hashableObject: any,
    insertableObject: Omit<CacheableInputSourceSchema, 'id'>
        | Omit<CacheableDataResultSchema, 'id'>
        | Omit<JsonSchemaRecordSchema, 'id'>,
): Promise<QueryStatus> {
    let sha256 = KnexDbInterface.getObjectHash(hashableObject)
    const selectResult = await knexDbi.knexQueryable.expandQuery(
        {
            [tableName]: [
                'id',
            ]
        }
    ).where(
        `${tableName}.sha256`, '=', sha256
    )
    if (selectResult.length > 0) {
        return Promise.resolve({
            operation: null,
            sha256,
        })
    } else {
        let insertable = {
            ...insertableObject,
            sha256,
        }
        return knexDbi.knexQueryable.knex(tableName).insert(insertable).then((insertResult) => {
            return {
                sha256,
                operation: QueryOperationType.INSERT,
            }
        })
    }
}

function sqliteDateTimeNow(): string {
    return new Date().toISOString().replace('T', ' ').replace('Z', '')
}

export enum QueryOperationType {
    INSERT = 'INSERT',
    UPSERT = 'UPSERT',
}

export interface QueryStatus {
    operation: QueryOperationType | null,
    sha256: string,
    replacedSha256?: string,
}

export function vanillaFilesystemLoader(inputSourcePath: string): Promise<string> {
    return Promise.resolve(slurp(inputSourcePath))
}

export function unflattenToType<T>(dataRecord: any, dataTableName: DefaultTableNames): T {
    return unflatten(dataRecord)[dataTableName] as T
}

export async function getRecordBySha256<T>(
    knexDbi: KnexDbInterface,
    tableName: DefaultTableNames,
    sha256: string,
): Promise<T> {
    let query = { [tableName]: Object.keys(TableMapping[tableName].properties) }
    let selector = { [`${tableName}.sha256`]: sha256 }
    const selectResult = await knexDbi.knexQueryable.expandQuery(query).where(selector).first()
    return selectResult == null ? null : unflattenToType<T>(selectResult, tableName)
}

export async function upsertFileSystemInputSourceInDatabase(
    knexDbi: KnexDbInterface,
    inputSourcePath: string,
    inputSourceLoader: (inputSourcePath: string) => Promise<string>,
): Promise<QueryStatus> {
    const tableName: DefaultTableNames = 'CacheableInputSource'

    if (inputSourceLoader == null) {
        inputSourceLoader = vanillaFilesystemLoader
    }

    return inputSourceLoader(inputSourcePath).then((inputSourceContent) => {
        let sha256 = getSha256(inputSourceContent)
        let whereClause = {
            [`${tableName}.sourcePath`]: inputSourcePath,
        }
        return knexDbi.knexQueryable.expandQuery(
            {
                [tableName]: [
                    'id',
                    'sha256',
                ]
            }
        ).where(whereClause).first().then((selectResult): Promise<QueryStatus> => {
            if (selectResult != null) {
                if (selectResult[`${tableName}.sha256`] == sha256) {
                    // exists and is identical
                    return Promise.resolve({
                        sha256,
                        operation: null,
                    })
                } else {
                    let updateable: Partial<CacheableInputSourceSchema> = {
                        updatedAt: sqliteDateTimeNow(),
                        sha256: sha256,
                        size: inputSourceContent.length,
                    }
                    return knexDbi.knexQueryable.knex(tableName).update(updateable).where(whereClause).then((updatedResult) => {
                        return {
                            sha256,
                            operation: QueryOperationType.UPSERT,
                            replacedSha256: selectResult[`${tableName}.sha256`],
                        }
                    })
                }
            } else {
                let insertable: Partial<CacheableInputSourceSchema> = {
                    updatedAt: sqliteDateTimeNow(),
                    sha256: sha256,
                    size: inputSourceContent.length,
                    sourcePath: inputSourcePath,
                }
                return knexDbi.knexQueryable.knex(tableName).insert(insertable).then((insertResult) => {
                    return {
                        sha256,
                        operation: QueryOperationType.INSERT,
                    }
                })
            }
        })
    })
}

export async function ensureJsonSchemaInDatabase(
    knexDbi: KnexDbInterface,
    jsonSchemaObject: JSONSchema
): Promise<JsonSchemaRecordSchema> {
    let tableName: DefaultTableNames = 'JsonSchemaRecord'
    return ensureHashableObjectInDatabase(
        knexDbi,
        tableName,
        jsonSchemaObject,
        // this must be fully specified except for `id`
        {
            content: canonicalize(jsonSchemaObject),
            createdAt: sqliteDateTimeNow(),
            description: jsonSchemaObject.description,
        }
    ).then(async (queryResult) => {
        return await getRecordBySha256<JsonSchemaRecordSchema>(
            knexDbi,
            tableName,
            queryResult.sha256,
        )
    })
}

export async function runDataImportProcessForInputSource(
    knexDbi: KnexDbInterface,
    inputSourcePath: string,
    inputSourceLoader: (inputSourcePath: string) => Promise<string>,
    importerProcess: (inputSourceContent: string) => Promise<Array<string>>,
    importValidatorSchema: JSONSchema,
): Promise<number> {
    const inputSourceTableName: DefaultTableNames = 'CacheableInputSource'
    let inputSourceQueryStatus = await upsertFileSystemInputSourceInDatabase(
        knexDbi,
        inputSourcePath,
        inputSourceLoader,
    )

    if (inputSourceQueryStatus.operation == QueryOperationType.UPSERT
        && inputSourceQueryStatus.replacedSha256 == null
    ) {
        console.debug('up to date')
        return 0
    }

    let jsonSchemaEntry = await ensureJsonSchemaInDatabase(knexDbi, importValidatorSchema)
    return inputSourceLoader(inputSourcePath).then((sourceContent) => {
        return importerProcess(sourceContent)
    }).then(async (contentIterable: Array<string>) => {
        let inserts = contentIterable.map(async (content) => {
            let jsonableDataObject = JSON.parse(content)
            let validatedResult = await validateDataWithSchema(
                jsonableDataObject,
                importValidatorSchema,
            )
            if (!validatedResult.isValid) {
                console.warn(validatedResult.errors)
                throw new Error(`vailed to validate input data: ${content}`)
            }
            let canonicalizedJson = canonicalize(jsonableDataObject)
            return ensureHashableObjectInDatabase(
                knexDbi,
                'CacheableDataResult',
                jsonableDataObject,
                {
                    CacheableDataResult_id: null,  // no parent
                    CacheableInputSource_id: inputSourceQueryStatus[`${inputSourceTableName}.id`],
                    JsonSchemaRecordSchema_id: jsonSchemaEntry.id,
                    TransformerData_id: null,  // no transformer (= initial import)
                    content: canonicalizedJson,
                    createdAt: sqliteDateTimeNow(),
                    sha256: getSha256(canonicalizedJson),
                    size: canonicalizedJson.length,
                } as Omit<CacheableDataResultSchema, 'id'>
            )
        })
        return Promise.all(inserts).then((results) => {
            return results.filter(qr => {
                return qr.operation != null
            }).length
        })
    })
}

export async function ensureRawDataInDatabase(
    knexDbi: KnexDbInterface,
    sourceData: string,
): Promise<CacheableDataResultSchema> {
    let tableName: DefaultTableNames = 'CacheableDataResult'
    let sha256 = getSha256(sourceData)
    const selectResult = await getRecordBySha256<CacheableDataResultSchema>(knexDbi, tableName, sha256)
    if (selectResult != null) {
        return selectResult
    } else {
        let insertable: Omit<CacheableDataResultSchema, 'id'> = {
            content: sourceData,
            createdAt: sqliteDateTimeNow(),
            sha256,
            size: sourceData.length,
        }
        return knexDbi.knexQueryable.knex(tableName).insert(insertable).then((insertResult) => {
            return getRecordBySha256<CacheableDataResultSchema>(knexDbi, tableName, sha256)
        })
    }
}

export async function runCacheableTransformationForData(
    knexDbi: KnexDbInterface,
    transformer: Transformer,
    sourceData: any,
) {
    const dataResultTableName: DefaultTableNames = 'CacheableDataResult'
    const transformerDataRecord = await ensureRawDataInDatabase(knexDbi, transformer.sourceCode)

    return transformer.transform(
        wrapTransformationContext(sourceData)
    ).then((wrappedResult) => {
        return unwrapTransformationContext(wrappedResult)
    }).then((transformedData) => {
        let insertable: Partial<CacheableDataResultSchema> = {
            content: canonicalize(transformedData),
            createdAt: sqliteDateTimeNow(),
        }
        return ensureHashableObjectInDatabase(
            knexDbi,
            dataResultTableName,
            transformedData,
            insertable,
        )
    })
}