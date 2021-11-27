require('dotenv').config()
import { generateTablesFromSchemas, getDatabaseModelsJsonSchemas, loadEnvDefinedDatabase } from '../src/database'


const knex = loadEnvDefinedDatabase(process.env.DATABASE_NAME)
let jsonSchemas = getDatabaseModelsJsonSchemas()
generateTablesFromSchemas(knex, jsonSchemas).finally(() => {
    knex.destroy()
})