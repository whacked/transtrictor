require('dotenv').config()
import * as path from 'path'
import * as jsvg from '../src/jsvg-lib'
import * as fs from 'fs'
import { slurp } from '../src/transformer'
import { JSONSchema } from '@apidevtools/json-schema-ref-parser'
import Knex from 'knex'
import * as col from 'colorette'


let SQLITE_DATABASE: string = process.env.DATABASE_NAME ?? ':memory:'
console.info(`using database: ${col.yellow(SQLITE_DATABASE)}`)

const knex = Knex({
    client: 'sqlite3',
    connection: {
        filename: SQLITE_DATABASE,
    },
})


export async function jsonSchemaToTableCreator(jsonSchema: JSONSchema) {
    let propertyNames = Object.keys(jsonSchema.properties)
    let tableName = jsonSchema.title ?? 'NoName'
    return knex.schema.hasTable(tableName).then((tableExists) => {
        if (tableExists) {
            return null
        } else {
            let createTableCommand = knex.schema.createTable(
                tableName,
                (table) => {

                    for (let i = 0; i < propertyNames.length; ++i) {
                        let propertyName = propertyNames[i]

                        if (propertyName == 'id') {  // treat primary key
                            table.increments(propertyName).primary()
                        } else if (propertyName.endsWith('_id')) {  // treat as join column
                            table.integer(propertyName)
                        } else if (propertyName == 'sha256') {  // treat as unique
                            table.string(propertyName).unique()
                        } else {
                            let propDefinition = jsonSchema.properties[propertyName]
                            switch (propDefinition['type']) {
                                case 'number':
                                    table.float(propertyName)
                                    break
                                case 'string':
                                    table.string(propertyName)
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
            console.debug(createTableCommand.toSQL())
            return createTableCommand
        }
    })
}

interface IForeignKey {
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


const AUTOGEN_SCHEMAS_DIRECTORY = path.join(
    __dirname, '..', 'src/autogen/schemas'
)

let foreignKeysToProcess: Array<IForeignKey> = []
let processedTables: Record<string, any> = {}

export async function generateTablesFromSchemas(jsonSchemas: Array<JSONSchema>) {
    let generators = jsonSchemas.map((schemaData) => {
        let createTableCommand = jsonSchemaToTableCreator(schemaData)
        if (createTableCommand == null) {
            return
        }
        processedTables[schemaData.title] = createTableCommand
        foreignKeysToProcess = foreignKeysToProcess.concat(extractForeignKeys(schemaData))
        return createTableCommand
    }).filter(x => x)
    return Promise.all(generators)
}


let jsonSchemas = fs.readdirSync(AUTOGEN_SCHEMAS_DIRECTORY).map((schemaFileName) => {
    console.log(`processing ${col.blue(schemaFileName)}...`)
    let schemaData = JSON.parse(slurp(path.join(AUTOGEN_SCHEMAS_DIRECTORY, schemaFileName))) as JSONSchema
    if (schemaData.title == null) {
        schemaData.title = schemaFileName.split('.')[0]
    }
    return schemaData

})

generateTablesFromSchemas(jsonSchemas).then(async (_) => {

    let foreignKeyCommands = []
    for (const foreignKey of foreignKeysToProcess) {
        if (processedTables[foreignKey.foreignTableName] == null) {
            console.warn(col.magenta(`skipping table with no schema: ${foreignKey.foreignTableName}`))
            continue
        }
        let foreignKeyConstraintCommand = knex.schema.alterTable(foreignKey.localTableName, (table) => {
            table.foreign(foreignKey.localKey).references(`${foreignKey.foreignTableName}.${foreignKey.foreignKey}`)
        })

        console.info(foreignKey)
        console.debug(foreignKeyConstraintCommand.toSQL())

        foreignKeyCommands.push(foreignKeyConstraintCommand)
    }

    await Promise.all(foreignKeyCommands)
}).then((_) => {

})