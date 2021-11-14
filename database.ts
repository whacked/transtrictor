import * as fs from 'fs'
import * as KnexLib from 'knex'
import Knex from 'knex'


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