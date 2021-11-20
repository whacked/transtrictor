require('dotenv').config()
import { JSONSchema } from '@apidevtools/json-schema-ref-parser'
import * as col from 'colorette'
import * as fs from 'fs'
import Knex from 'knex'
import * as path from 'path'
import { generateTablesFromSchemas, loadEnvDefinedDatabase } from '../src/database'
import { slurp } from '../src/transformer'


const knex = loadEnvDefinedDatabase()

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
    knex.destroy()
})