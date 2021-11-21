import * as jsvg from './jsvg-lib'
import { JS } from './jsvg-lib'
import * as path from 'path'
import {
    RawMorphismTransformer,
    slurp,
    unwrapTransformationContext,
    wrapTransformationContext
} from './transformer'
import {
    cliMain
} from '../scripts/cli'
import { upsertFileSystemInputSourceInDatabase, generateTablesFromSchemas, getDatabaseModelsJsonSchemas, KnexDbInterface, loadEnvDefinedDatabase, DefaultTableNames } from './database'

const TEST_DATA_DIR = path.join(__dirname, 'testdata')


function getTestFilePath(testFileName: string): string {
    return path.join(TEST_DATA_DIR, testFileName)
}

test('cache a file and detect its change', async () => {
    let inputSourcePath = getTestFilePath('example-json-input-good-multiline.jsonl')
    let sampleInputData = slurp(inputSourcePath)
    let sampleInputDataLines = sampleInputData.split(/\n/)
    let preModifiedLoader = (_: string) => {
        return Promise.resolve(sampleInputDataLines.slice(0, sampleInputDataLines.length - 1).join('\n'))
    }
    let postModifiedLoader = (_: string) => {
        return Promise.resolve(sampleInputData)
    }

    const databaseName = ':memory:'
    let knex = loadEnvDefinedDatabase(databaseName)
    let jsonSchemas = getDatabaseModelsJsonSchemas()
    return generateTablesFromSchemas(knex, jsonSchemas).then(async () => {
        const knexDbi = new KnexDbInterface(knex)
        const tableName: DefaultTableNames = 'CacheableInputSource'
        const query = {
            [tableName]: ['id', 'sha256', 'updatedAt']
        }

        let sha256Sum1 = await upsertFileSystemInputSourceInDatabase(knexDbi, inputSourcePath, preModifiedLoader)
        expect(sha256Sum1).not.toEqual('276f2b437beb716ccc5c3eb0a5daa261f9f64857d101dcffe70676afbdd0c213')
        let initialEntry = await knexDbi.knexQueryable.expandQuery(query).where({ sourcePath: inputSourcePath }).first()

        await new Promise((resolve, reject) => {
            setTimeout(() => {
                resolve(null)
            }, 1)
        })

        let sha256Sum2 = await upsertFileSystemInputSourceInDatabase(knexDbi, inputSourcePath, postModifiedLoader)
        expect(sha256Sum2).toEqual('276f2b437beb716ccc5c3eb0a5daa261f9f64857d101dcffe70676afbdd0c213')
        let updatedEntry = await knexDbi.knexQueryable.expandQuery(query).where({ sourcePath: inputSourcePath }).first()

        let initialUpdatedAtTime = new Date(initialEntry[`${tableName}.updatedAt`]).getTime()
        let updatedUpdatedAtTime = new Date(updatedEntry[`${tableName}.updatedAt`]).getTime()
        expect(updatedUpdatedAtTime).toBeGreaterThan(initialUpdatedAtTime)

    }).finally(() => {
        knex.destroy()
    })
})

