import { JSONSchema } from '@apidevtools/json-schema-ref-parser'
import * as path from 'path'
import {
    DefaultTableNames, generateTablesFromSchemas,
    getDatabaseModelsJsonSchemas,
    getSha256,
    KnexDbInterface,
    loadEnvDefinedDatabase, runDataImportProcessForInputSource, upsertFileSystemInputSourceInDatabase
} from './database'
import {
    slurp
} from './transformer'

const TEST_DATA_DIR = path.join(__dirname, 'testdata')


function getTestFilePath(testFileName: string): string {
    return path.join(TEST_DATA_DIR, testFileName)
}


describe('input data caching and dependent operations', () => {
    let inputSourcePath = getTestFilePath('example-json-input-good-multiline.jsonl')
    let sampleInputData = slurp(inputSourcePath).trim()
    let sampleInputDataLines = sampleInputData.split(/\n/)
    let preModifiedLoader = (_: string) => {
        return Promise.resolve(sampleInputDataLines.slice(0, sampleInputDataLines.length - 1).join('\n'))
    }
    let postModifiedLoader = (_: string) => {
        return Promise.resolve(sampleInputData)
    }

    const databaseName = ':memory:'
    let jsonSchemas = getDatabaseModelsJsonSchemas()

    test('cache a file and detect its change', async () => {
        let knex = loadEnvDefinedDatabase(databaseName)
        let jsonSchemas = getDatabaseModelsJsonSchemas()
        return generateTablesFromSchemas(knex, jsonSchemas).then(async () => {
            const knexDbi = new KnexDbInterface(knex)
            const tableName: DefaultTableNames = 'CacheableInputSource'
            const query = {
                [tableName]: ['id', 'sha256', 'updatedAt']
            }
            const originalFileHash = getSha256(sampleInputData)

            // sanity check
            expect(originalFileHash).toEqual('df20b1d7b6d43e4fd8c7a402e179cf0fad7e51411384b18927618104cde12e1d')

            let initialResult = await upsertFileSystemInputSourceInDatabase(knexDbi, inputSourcePath, preModifiedLoader)
            expect(initialResult.sha256).not.toEqual(originalFileHash)
            let initialEntry = await knexDbi.knexQueryable.expandQuery(query).where({ sourcePath: inputSourcePath }).first()

            await new Promise((resolve, reject) => {
                setTimeout(() => {
                    resolve(null)
                }, 1)
            })

            let updatedResult = await upsertFileSystemInputSourceInDatabase(knexDbi, inputSourcePath, postModifiedLoader)
            expect(updatedResult.sha256).toEqual(originalFileHash)
            let updatedEntry = await knexDbi.knexQueryable.expandQuery(query).where({ sourcePath: inputSourcePath }).first()

            let initialUpdatedAtTime = new Date(initialEntry[`${tableName}.updatedAt`]).getTime()
            let updatedUpdatedAtTime = new Date(updatedEntry[`${tableName}.updatedAt`]).getTime()
            expect(updatedUpdatedAtTime).toBeGreaterThan(initialUpdatedAtTime)

        }).finally(() => {
            knex.destroy()
        })
    })

    test('re-compute data transforms when source data has changed', async () => {
        let sampleDataValidator: JSONSchema = {
            type: 'object',
            properties: {
                tag: { type: 'string' },
                someNumber: { type: 'number' },
                tsconfig: {
                    type: 'object',
                    properties: {
                        charset: { type: 'string' },
                    }
                }
            }
        }

        let knex = loadEnvDefinedDatabase(databaseName)
        return generateTablesFromSchemas(knex, jsonSchemas).then(async () => {
            const knexDbi = new KnexDbInterface(knex)
            const tableName: DefaultTableNames = 'CacheableInputSource'
            const query = {
                [tableName]: ['id', 'sha256', 'updatedAt']
            }

            let initialResult = await upsertFileSystemInputSourceInDatabase(knexDbi, inputSourcePath, preModifiedLoader)
            let initialEntry = await knexDbi.knexQueryable.expandQuery(query).where({ sourcePath: inputSourcePath }).first()

            let splitTextToLinesLoader = (inputSourceContent: string) => {
                return Promise.resolve(inputSourceContent.split('\n'))
            }

            let numInitialUpdates = await runDataImportProcessForInputSource(
                knexDbi,
                inputSourcePath,
                preModifiedLoader,
                splitTextToLinesLoader,
                sampleDataValidator,
            )

            expect(numInitialUpdates).toEqual(2)

            let numNewUpdates = await runDataImportProcessForInputSource(
                knexDbi,
                inputSourcePath,
                postModifiedLoader,
                splitTextToLinesLoader,
                sampleDataValidator,
            )

            expect(numNewUpdates).toEqual(1)

        }).finally(() => {
            knex.destroy()
        })
    })

})
