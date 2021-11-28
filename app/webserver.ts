import express from 'express'
import ExpressPouchDb from 'express-pouchdb'
import {
    pouchDbConfig,
    SchemaStatisticsLoader,
} from '../src/docdb'


const SERVER_PORT = 1235


const ePdb = ExpressPouchDb(pouchDbConfig)
const app = express()
app.use('/api', ePdb)

export function startWebserver() {
    return app.listen(SERVER_PORT, () => {
        console.log(`data server running on port ${SERVER_PORT}`)
    })
}

if (require.main == module) {

    let randomData = ['foo', 'bar', 'baz'].map((data, index) => {
        let varyingStructure = index < 2
            ? { oneLevel: 'flat' }
            : { two: { level: 'nested' } }
        return {
            index,
            myText: data,
            ...varyingStructure,
        }
    })

    SchemaStatisticsLoader.autoLoadSingleDataset(randomData)
    startWebserver()
}