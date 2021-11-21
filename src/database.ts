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
import { slurp } from './transformer'


const AUTOGEN_SCHEMAS_DIRECTORY = path.join(path.dirname(__filename), 'autogen/schemas')

interface DefaultTables {
    CacheableInputSource: CacheableInputSourceSchema,
    CacheableDataWithSchema: CacheableDataResultSchema,
    JsonSchemaRecord: JsonSchemaRecordSchema,
}

type DefaultTableNames = keyof DefaultTables

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
            }
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

        console.log(`- foreign key joining ${foreignKey.localTableName}.${foreignKey.localKey} --> ${foreignKey.foreignTableName}.${foreignKey.foreignKey}:`)
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
    })
}

export function getDatabaseModelsJsonSchemas() {
    return fs.readdirSync(AUTOGEN_SCHEMAS_DIRECTORY).map((schemaFileName) => {
        console.log(`processing ${col.blue(schemaFileName)}...`)
        let schemaData = JSON.parse(slurp(path.join(AUTOGEN_SCHEMAS_DIRECTORY, schemaFileName))) as JSONSchema
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
    insertableObject: Partial<CacheableInputSourceSchema>
        | Partial<CacheableDataResultSchema>
        | Partial<JsonSchemaRecordSchema>,
): Promise<string> {
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
        return Promise.resolve(sha256)
    } else {
        let insertable = {
            ...insertableObject,
            sha256,
        }
        return knexDbi.knexQueryable.knex(tableName).insert(insertable).then((insertResult) => {
            return sha256
        })
    }
}

function createdTimeNow(): string {
    return new Date().toISOString().replace('T', ' ').replace('Z', '')
}

export async function ensureFileSystemInputSourceInDatabase(
    knexDbi: KnexDbInterface,
    inputSourcePath: string,
    inputSourceLoader?: (inputSourcePath: string) => Promise<string>,
) {
    const tableName: DefaultTableNames = 'CacheableInputSource'

    if (inputSourceLoader == null) {
        inputSourceLoader = (inputSourcePath: string): Promise<string> => {
            return Promise.resolve(slurp(inputSourcePath))
        }
    }

    return inputSourceLoader(inputSourcePath).then((inputSourceContent) => {
        let sha256 = getSha256(inputSourceContent)
        return knexDbi.knexQueryable.expandQuery(
            {
                [tableName]: [
                    'id',
                ]
            }
        ).where(
            `${tableName}.sha256`, '=', sha256
        ).then((selectResult) => {
            if (selectResult.length > 0) {
                return Promise.resolve(sha256)
            } else {
                let insertable: Partial<CacheableInputSourceSchema> = {
                    createdAt: createdTimeNow(),
                    sha256: sha256,
                    size: inputSourceContent.length,
                    sourcePath: inputSourcePath,
                }
                return knexDbi.knexQueryable.knex(tableName).insert(insertable).then((insertResult) => {
                    return sha256
                })
            }
        })
    })
}

export function ensureJsonSchemaInDatabase(
    knexDbi: KnexDbInterface,
    jsonSchemaObject: JSONSchema
) {
    return ensureHashableObjectInDatabase(
        knexDbi,
        'JsonSchemaRecord',
        jsonSchemaObject,
        // this must be fully specified except for `id`
        {
            content: canonicalize(jsonSchemaObject),
            createdAt: createdTimeNow(),
            description: jsonSchemaObject.description ?? '',
        }
    )
}