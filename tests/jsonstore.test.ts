import { SchemaTaggedPayload } from '../src/autogen/interfaces/anthology/2022/03/25/SchemaTaggedPayload'
import { Transformer } from '../src/autogen/interfaces/anthology/2022/03/30/Transformer'
import { Config, CURRENT_PROTOCOL_VERSION } from '../src/defs'
import { SqliteDatabase } from '../src/jsonstore/sqlite'
import { toSha256Checksum } from '../src/util'


describe('standard collections I/O', () => {

    Config.SQLITE_DATABASE_PATH = ':memory:'

    beforeAll(async () => {
        console.log('init')
        await SqliteDatabase.getSingleton()
    })

    afterAll(async () => {
        console.log('done')
        let dbDriver = await SqliteDatabase.getSingleton()
        setTimeout(() => {
            dbDriver.database.close()
        }, 2222)
    })

    let testInputSchema = {
        type: 'object',
        properties: {
            foo: {
                type: 'number',
            },
            bar: {
                type: 'string',
            }
        },
        required: ['bar'],
        title: 'my-test-input-schema',
        version: '0',
    }

    const basePayload = {
        bar: 'baz',
        foo: 1,
    }
    const payloadChecksum = 'sha256:fdd6d11951299b11b907b704cb0030da837421f7be1315f0b2d16c86cee08bdc'  // toSha256Checksum(basePayload)
    let originalPayload: SchemaTaggedPayload = {
        data: basePayload,
        dataChecksum: payloadChecksum,
        protocolVersion: CURRENT_PROTOCOL_VERSION,
        schemaName: 'my-test-input-schema',
        schemaVersion: '0',
    }

    let testOutputSchema = {
        type: 'object',
        properties: {
            newBar: {
                type: 'number',
            },
            newFoo: {
                type: 'number',
            }
        },
        required: ['bar'],
        title: 'my-test-output-schema',
        version: '0',
    }

    // IMPORTANT: the transformed output is a SchemaTaggedPayload
    let jsonataCode = `
    {
        "output": {
            "data": {
                "newBar": $.input.foo + $.input.foo,
                "newFoo": "quux" & $.input.bar & $.sideLoaded
            }
        }
    }
    `

    test('schema storage and retrieval', async () => {
        let dbDriver = await SqliteDatabase.getSingleton()

        await dbDriver.getTables().then((tables) => {
            expect(tables.filter(row => row['type'] == 'table').length).toBe(3)
        })
        await dbDriver.putSchema(testOutputSchema)

        return dbDriver.putSchema(testInputSchema).then(() => {
            return dbDriver.getSchema('my-test-input-schema').then((schema) => {
                return expect(schema).toEqual(testInputSchema)
            })
        })
    })

    test('transformer storage and retrieval', async () => {
        let dbDriver = await SqliteDatabase.getSingleton()
        let transformerData: Transformer = {
            language: 'jsonata',
            sourceCode: jsonataCode,
            sourceCodeChecksum: toSha256Checksum(jsonataCode),
            name: 'test-transformer',
            supportedInputSchemas: ['my-test-input-schema'],
            outputSchema: 'my-test-output-schema',
        }
        return dbDriver.putTransformer(transformerData).then(() => {
            return dbDriver.getTransformer('test-transformer').then((transformer) => {
                expect(transformer.sourceCode).toBe(jsonataCode)
            })
        })
    })

    test('schema tagged payload storage and retrieval', async () => {
        let dbDriver = await SqliteDatabase.getSingleton()
        return dbDriver.putSchemaTaggedPayload(originalPayload).then(() => {
            return dbDriver.getSchemaTaggedPayload(payloadChecksum).then((retrievedPayload) => {
                expect(retrievedPayload).toEqual(originalPayload)
            })
        })
    })

    test('data transformation application and retrieval', async () => {
        let dbDriver = await SqliteDatabase.getSingleton()

        // fixme; this test should run after the other ones because they insert data
        await new Promise((resolve, reject) => {
            setTimeout(() => {
                resolve(true)
            }, 999)
        })

        return dbDriver.transformPayload(
            'test-transformer',
            payloadChecksum,
            {
                sideLoaded: "-oh-yeah"
            }
        ).then((result) => {
            return expect(result['data']).toEqual({
                newBar: 2,
                newFoo: 'quuxbaz-oh-yeah',
            })
        })
    })
})
