import { JSONSchema } from '@apidevtools/json-schema-ref-parser'
import {
    DefaultTableNames,
    DefaultTables,
    ensureRawDataInDatabase,
    generateTablesFromSchemas,
    getDatabaseModelsJsonSchemas,
    getSha256,
    KnexDbInterface,
    loadEnvDefinedDatabase,
    runDataImportProcessForInputSource,
    runCacheableTransformationForData,
    upsertFileSystemInputSourceInDatabase,
    unflattenToType
} from '../src/database'
import { loadTransformerFile, unwrapTransformationContext, wrapTransformationContext } from '../src/transformer'
import { slurp } from '../src/util'
import { getTestFilePath } from './common'
import CacheableDataResult from '../src/autogen/schemas/CacheableDataResult.schema.json'
import { unflatten } from 'flat'
import { CacheableDataResultSchema } from '../src/autogen/interfaces/CacheableDataResult'


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

    let splitTextToLinesLoader = (inputSourceContent: string) => {
        return Promise.resolve(inputSourceContent.split('\n'))
    }

    test('cache a file and detect its change', async () => {
        let knex = loadEnvDefinedDatabase(databaseName)
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

        let knex = loadEnvDefinedDatabase(databaseName)
        return generateTablesFromSchemas(knex, jsonSchemas).then(async () => {
            const knexDbi = new KnexDbInterface(knex)
            const tableName: DefaultTableNames = 'CacheableInputSource'
            const query = {
                [tableName]: ['id', 'sha256', 'updatedAt']
            }

            let initialResult = await upsertFileSystemInputSourceInDatabase(knexDbi, inputSourcePath, preModifiedLoader)
            let initialEntry = await knexDbi.knexQueryable.expandQuery(query).where({ sourcePath: inputSourcePath }).first()

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


    test('cache and load transformer', async () => {
        let transformer = loadTransformerFile(getTestFilePath('sample-transformer.jsonata'))
        let knex = loadEnvDefinedDatabase(databaseName)

        return generateTablesFromSchemas(knex, jsonSchemas).then(async () => {
            const knexDbi = new KnexDbInterface(knex)
            const tableName: DefaultTableNames = 'CacheableInputSource'
            const dataTableName: DefaultTableNames = 'CacheableDataResult'

            await runDataImportProcessForInputSource(
                knexDbi,
                inputSourcePath,
                preModifiedLoader,
                splitTextToLinesLoader,
                sampleDataValidator,
            )

            return knexDbi.knexQueryable.expandQuery({
                [dataTableName]: Object.keys(CacheableDataResult.properties)
            }).then((rows) => {
                return rows.map((row: any) => {
                    return unflattenToType<CacheableDataResultSchema>(row, dataTableName)
                })
            }).then(async (dataResults: Array<CacheableDataResultSchema>) => {
                let out = []
                for (const dataResult of dataResults) {
                    let transformedRecord = await runCacheableTransformationForData(
                        knexDbi,
                        transformer,
                        JSON.parse(dataResult.content),
                    )
                    out.push(transformedRecord)
                }
                expect(out.length).toEqual(2)
                return out
            })
        }).then(async (_) => {
            const knexDbi = new KnexDbInterface(knex)
            const dataTableName: DefaultTableNames = 'CacheableDataResult'
            const cacheableDataResults: Array<CacheableDataResultSchema> = await knexDbi.knexQueryable.expandQuery({
                [dataTableName]: Object.keys(CacheableDataResult.properties)
            }).then((rows) => {
                return rows.map((record: any) => {
                    return unflattenToType<CacheableDataResultSchema>(record, dataTableName)
                })
            })
            // 1 record for the transformer
            // 2 records for the source data
            // 2 records for the transformed data
            expect(cacheableDataResults.length).toEqual(5)

            let latestRecord = cacheableDataResults[cacheableDataResults.length - 1]
            console.log('latest', latestRecord)
            let latestSavedData = JSON.parse(latestRecord.content)

            let originalSourceData = JSON.parse(sampleInputDataLines[sampleInputDataLines.length - 2])
            let originalTransformedData = await transformer.transform(
                wrapTransformationContext(originalSourceData)
            ).then((wrappedTransformedData) => {
                return unwrapTransformationContext(wrappedTransformedData)
            })
            expect(latestSavedData).toMatchObject(originalTransformedData)

            console.debug('simulate upstream source modification')
            let newImportCount = await runDataImportProcessForInputSource(
                knexDbi,
                inputSourcePath,
                postModifiedLoader,
                splitTextToLinesLoader,
                sampleDataValidator,
            )
            expect(newImportCount).toEqual(1)

            let transformedRecord = await runCacheableTransformationForData(
                knexDbi,
                transformer,
                JSON.parse(sampleInputDataLines[2]),
            )

            const newCacheableDataResults: Array<CacheableDataResultSchema> = await knexDbi.knexQueryable.expandQuery({
                [dataTableName]: Object.keys(CacheableDataResult.properties)
            }).then((rows) => {
                return rows.map((record: any) => {
                    return unflattenToType<CacheableDataResultSchema>(record, dataTableName)
                })
            })

            // 1 record for the latest source
            // 1 record for the latest transformed
            expect(newCacheableDataResults.length).toEqual(7)

            // new transform process should not affect existing records
            expect(newCacheableDataResults[4].createdAt).toEqual(latestRecord.createdAt)

            let finalRecord = newCacheableDataResults[6]
            expect(finalRecord.createdAt).not.toEqual(latestRecord.createdAt)

            // rerun should do nothing
            let reImportCount = await runDataImportProcessForInputSource(
                knexDbi,
                inputSourcePath,
                postModifiedLoader,
                splitTextToLinesLoader,
                sampleDataValidator,
            )
            expect(reImportCount).toEqual(0)
        }).finally(() => {
            knex.destroy()
        })
    })
})
