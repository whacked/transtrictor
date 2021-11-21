require('dotenv').config()
import { generateTablesFromSchemas, getDatabaseModelsJsonSchemas, initializeDatabaseWithDefaultTables, loadEnvDefinedDatabase } from '../src/database'


const knex = loadEnvDefinedDatabase(process.env.DATABASE_NAME)
let jsonSchemas = getDatabaseModelsJsonSchemas()
generateTablesFromSchemas(knex, jsonSchemas).finally(() => {
    knex.destroy()
})