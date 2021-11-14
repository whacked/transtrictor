require('dotenv').config()
import { JSONSchema } from '@apidevtools/json-schema-ref-parser'
import * as col from 'colorette'
import * as fs from 'fs'
import Knex from 'knex'
import * as path from 'path'
import { generateTablesFromSchemas } from '../database'
import { slurp } from '../src/transformer'


let SQLITE_DATABASE: string = process.env.DATABASE_NAME ?? ':memory:'
console.info(`using database: ${col.yellow(SQLITE_DATABASE)}`)

const knex = Knex({
    client: 'sqlite3',
    connection: {
        filename: SQLITE_DATABASE,
    },
})


const AUTOGEN_SCHEMAS_DIRECTORY = path.join(__dirname, '..', 'src/autogen/schemas')



let jsonSchemas = fs.readdirSync(AUTOGEN_SCHEMAS_DIRECTORY).map((schemaFileName) => {
    console.log(`processing ${col.blue(schemaFileName)}...`)
    let schemaData = JSON.parse(slurp(path.join(AUTOGEN_SCHEMAS_DIRECTORY, schemaFileName))) as JSONSchema
    if (schemaData.title == null) {
        schemaData.title = schemaFileName.split('.')[0]
    }
    return schemaData
})

generateTablesFromSchemas(knex, jsonSchemas).finally(() => {
    console.log('ok')
})