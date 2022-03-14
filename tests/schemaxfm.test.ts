import {
    getFlattenedNamespacedSchema,
    getFlattenedSchema,
    getSubSchema,
    InterfaceWithSchema,
    mergeNamespacedData,
    mergeSchemas,
    splitNamespacedData,
    verifyDataMatchesSchema,
} from '../src/schemaxfm'
import JsonSchemaRecord from '../src/autogen/schemas/JsonSchemaRecord.schema.json'
import CacheableInputSource from '../src/autogen/schemas/CacheableInputSource.schema.json'
import { CacheableInputSourceSchema as ICacheableInputSource } from '../src/autogen/interfaces/CacheableInputSource'
import CacheableDataResult from '../src/autogen/schemas/CacheableDataResult.schema.json'


describe('utility', () => {
    interface MyData {
        whatever: string
    }
    let myUntypedInput = {
        whatever: 'pizza pie',
    }
    let mySchema = {
        type: 'object',
        properties: {
            whatever: {
                type: 'string',
            },
        },
    }
    let validated = verifyDataMatchesSchema<MyData>(myUntypedInput, mySchema)
    expect(myUntypedInput).toEqual(validated)
})


describe('schema merging', () => {

    const schema1 = {
        title: 'schema1',
        type: 'object',
        properties: {
            funky: {
                type: 'string',
            },
            tags: {
                type: 'array',
                items: {
                    type: 'string'
                }
            }
        },
    }

    const schema2 = {
        title: 'schema2',
        type: 'object',
        properties: {
            monkey: {
                type: 'number',
            },
            bags: {
                type: 'array',
                items: {
                    type: 'boolean',
                }
            }
        }
    }

    test('non-merge cases', () => {
        expect(mergeSchemas({})).toMatchObject({})
        expect(mergeSchemas(schema1)).toMatchObject(schema1)
    })

    test('simple merge', () => {
        let mergedSchema = mergeSchemas(
            schema1, schema2,
        )

        expect(mergedSchema).toMatchObject({
            type: 'object',
            description: 'merged schemas: schema1, schema2',
            properties: {
                schema1: getSubSchema(schema1),
                schema2: getSubSchema(schema2),
            }
        })
    })

    test('multiple merges', () => {

        let mergedSchema1 = mergeSchemas(
            {
                title: 'JsonSchemaRecord1',
                ...JsonSchemaRecord
            },
            {
                title: 'CacheableInputSource2',
                ...CacheableInputSource,
            },
            {
                title: 'CacheableDataResult3',
                ...CacheableDataResult,
            },
            schema1, schema2,
        )
        expect(mergedSchema1.properties['schema1'] as any).toMatchObject(getSubSchema(schema1))

        let mergedSchema2 = mergeSchemas({
            JsonSchemaRecord_foo: JsonSchemaRecord,
            CacheableInputSource_bar: CacheableInputSource,
            CacheableDataResult_baz: CacheableDataResult,
            one: schema1,
            two: schema2,
        })

        expect(mergedSchema1.properties['CacheableInputSource2']).toMatchObject(
            mergedSchema2.properties['CacheableInputSource_bar']
        )
    })

    test('simple schema flattening', () => {
        let flattenedSchema = getFlattenedSchema({
            type: 'object',
            properties: {
                planet: {
                    type: 'string',
                },
                extra: {
                    type: 'object',
                    properties: schema1.properties,
                },
            },
        } as any)
        expect(flattenedSchema).toMatchObject({
            properties: {
                planet: { type: 'string' },
                'extra.funky': { type: 'string' },
                'extra.tags': {
                    type: 'array',
                    items: { type: 'string' },
                },
            }
        })
    })

    test('flattened schema', () => {
        let flattenedSchema = getFlattenedNamespacedSchema(schema1, schema2)
        expect(flattenedSchema).toMatchObject({
            properties: {
                'schema1/funky': { type: 'string', },
                'schema1/tags': { type: 'array', items: { type: 'string' } },
                'schema2/monkey': { type: 'number', },
                'schema2/bags': { type: 'array', items: { type: 'boolean' } },
            }
        })
    })
})

describe('data merging and splitting', () => {
    let entry1 = {
        foo: 'bar',
        nested1: {
            someNumber: 2,
            moreNested1: {
                weather: 'sunny',
                side: 'up',
            },
        },
        tags: ['apple', 'banana'],
    }
    let entry2 = {
        baz: 'quux',
        nested1: {
            confusing: 'name',
        },
        nested2: {
            someFloat: 3.14,
            confusing: 'quux',
        },
        tugs: [true, false],
    }

    let mergedData = mergeNamespacedData({
        namespace1: entry1,
        namespace2: entry2,
    })

    test('merge/split a flattened, namespace-based merged object', () => {
        expect(mergedData).toMatchObject({
            'namespace1/foo': 'bar',
            'namespace1/nested1.someNumber': 2,
            'namespace1/nested1.moreNested1.weather': 'sunny',
            'namespace1/nested1.moreNested1.side': 'up',
            'namespace1/tags': ['apple', 'banana'],
            'namespace2/baz': 'quux',
            'namespace2/nested1.confusing': 'name',
            'namespace2/nested2.someFloat': 3.14,
            'namespace2/nested2.confusing': 'quux',
            'namespace2/tugs': [true, false],
        })

        expect(splitNamespacedData(mergedData)).toMatchObject({
            namespace1: entry1,
            namespace2: entry2,
        })
    })
})

describe('schema reification, validation, hydration', () => {
    test('test InterfaceWithSchema setAttributes', () => {
        class MySchemafied extends InterfaceWithSchema<ICacheableInputSource> { }
        let mything = new MySchemafied(CacheableInputSource)
        let updated = mything.setAttributes({
            id: 57,
            sha256: 'asdfasdf',
            size: 123,
            sourcePath: '/dev/null',
            updatedAt: '2021-12-17',
            owner_id: 99,
        }, {
            noTouchMe: 'testValue'
        }, 'FoodBar')

        expect(updated).toMatchObject({
            'FoodBar/id': 57,
            'FoodBar/sha256': 'asdfasdf',
            'FoodBar/size': 123,
            'FoodBar/sourcePath': '/dev/null',
            'FoodBar/updatedAt': '2021-12-17',
            'FoodBar/owner_id': 99,
            noTouchMe: 'testValue',
        })
    })
})