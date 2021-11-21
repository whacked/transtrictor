require('dotenv').config()
import { initializeDatabaseWithDefaultTables } from '../src/database'


initializeDatabaseWithDefaultTables(process.env.DATABASE_NAME)