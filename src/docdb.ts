import PouchDB from 'pouchdb'
import * as GenerateSchema from 'generate-schema';
import { canonicalize } from 'json-canonicalize';
import { getSha256 } from '../src/database';
import {
    DATASET_TABLE_NAME,
    ExtendedResponse,
    SchemaStatistic,
    SCHEMA_TABLE_NAME,
} from './defs';


export class SchemaStatisticsLoader {
    static _singleton: SchemaStatisticsLoader

    static getSingleton() {
        return SchemaStatisticsLoader._singleton
    }
    static autoLoadData(dataRecords: Array<any>) {
        if (SchemaStatisticsLoader._singleton != null) {
            console.warn('autoLoadData can only be run once')
            return
        }

        SchemaStatisticsLoader._singleton = new SchemaStatisticsLoader(dataRecords)
    }

    private _allExtendedResponses: Array<ExtendedResponse>
    private _summaryStatitics: Record<string, SchemaStatistic>

    getAllExtendedResponses() {
        return this._allExtendedResponses
    }

    getSchemaSummaryStatistics() {
        return this._summaryStatitics
    }

    seedDbData() {
        seedDbData(DATASET_TABLE_NAME, async () => {
            return Promise.resolve(this.getAllExtendedResponses())
        })
    }

    seedDbSchemaData() {
        seedDbSchemaData(() => {
            return Promise.resolve(Object.values(this.getSchemaSummaryStatistics()))
        })
    }

    constructor(dataRecords: Array<any>, shouldInitializeDatabase: boolean = true) {
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

        if (shouldInitializeDatabase) {
            this.seedDbData()
            this.seedDbSchemaData()
        }
    }
}

export const pouchDbConfig = PouchDB.plugin(require('pouchdb-adapter-memory')).defaults({
    adapter: 'memory',
})

export async function seedDbData(databaseName: string, loadAllDocuments: () => Promise<Array<any>>) {
    const pdb = new PouchDB(databaseName, {
        adapter: 'memory',
    })

    return loadAllDocuments().then((documents: Array<any>) => {
        documents.forEach((doc, index) => {
            pdb.put({
                _id: index.toString(),
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