import PouchDB from 'pouchdb'
import * as GenerateSchema from 'generate-schema';
import { canonicalize } from 'json-canonicalize';
import { getSha256 } from '../src/database';
import {
    ExtendedResponse,
    SchemaStatistic,
    SCHEMA_TABLE_NAME,
} from './defs';


export class SchemaStatisticsLoader {

    static readonly DEFAULT_SINGLE_DATABASE_NAME = 'datasets'

    static _singleton: SchemaStatisticsLoader

    static getSingleton() {
        return SchemaStatisticsLoader._singleton
    }
    static autoLoadSingleDataset(dataRecords: Array<any>, singleDatasetDatabaseName: string = SchemaStatisticsLoader.DEFAULT_SINGLE_DATABASE_NAME) {
        if (SchemaStatisticsLoader._singleton != null) {
            console.warn('autoLoadSingleDataset can only be run once')
            return
        }

        SchemaStatisticsLoader._singleton = new SchemaStatisticsLoader(dataRecords, singleDatasetDatabaseName)
    }

    static autoLoadDatasets(dataRecordsMapping: Record<string, Array<any>>): Record<string, SchemaStatisticsLoader> {
        let out: Record<string, SchemaStatisticsLoader> = {}
        for (const databaseName of Object.keys(dataRecordsMapping)) {
            console.info(`loading database ${databaseName}`)
            let loader = new SchemaStatisticsLoader(dataRecordsMapping[databaseName], databaseName)
            out[databaseName] = loader
        }

        return out
    }

    private _allExtendedResponses: Array<ExtendedResponse>
    private _summaryStatitics: Record<string, SchemaStatistic>

    getAllExtendedResponses() {
        return this._allExtendedResponses
    }

    getSchemaSummaryStatistics() {
        return this._summaryStatitics
    }

    seedDbData(seedRecordsToDatabase: string) {
        seedDbData(seedRecordsToDatabase, async () => {
            return Promise.resolve(this.getAllExtendedResponses())
        })
    }

    seedDbSchemaData() {
        seedDbSchemaData(() => {
            return Promise.resolve(Object.values(this.getSchemaSummaryStatistics()))
        })
    }

    constructor(dataRecords: Array<any>, seedRecordsToDatabase: string = null) {
        this._allExtendedResponses = []
        this._summaryStatitics = dataRecords.reduce((accumulator, currentValue, currentIndex) => {

            let schema = GenerateSchema.json(
                'GeneratedSchema',
                currentValue,
            )
            let sourceCode = canonicalize(schema)
            let hash = getSha256(sourceCode)

            this._allExtendedResponses.push({
                schemaHash: hash,
                data: currentValue,
            })

            let currentStatistic: SchemaStatistic = accumulator[hash] ?? {
                sourceCode,
                schemaHash: hash,
                firstAppearedAt: currentIndex,
                total: 0,
                databaseName: seedRecordsToDatabase ?? 'default',
            }
            return {
                ...accumulator,
                [hash]: {
                    ...currentStatistic,
                    lastAppearedAt: currentIndex,
                    total: currentStatistic.total + 1,
                },
            }
        }, {} as Record<string, SchemaStatistic>)

        if (seedRecordsToDatabase != null) {
            this.seedDbData(seedRecordsToDatabase)
            this.seedDbSchemaData()
        }
    }
}

export const pouchDbConfig = PouchDB.plugin(require('pouchdb-adapter-memory')).defaults({
    adapter: 'memory',
})

let documentCounter = 0

export async function seedDbData(databaseName: string, loadAllDocuments: () => Promise<Array<any>>) {
    PouchDB.plugin(require('pouchdb-upsert'))

    const pdb = new PouchDB(databaseName, {
        adapter: 'memory',
    })

    return loadAllDocuments().then((documents: Array<any>) => {
        documents.forEach((doc, index) => {
            pdb.putIfNotExists({
                _id: `${++documentCounter}`,
                ...doc,
            }).catch((err) => {
                console.warn(err)
                throw err
            })
        })
    })
}

export async function seedDbSchemaData(loadAllSchemaDocuments: () => Promise<Array<any>>) {
    return seedDbData(SCHEMA_TABLE_NAME, loadAllSchemaDocuments)
}