import { getSubSchema, mergeNamespacedData, mergeSchemas, splitNamespacedData } from '../src/schemaxfm'
import JsonSchemaRecord from '../src/autogen/schemas/JsonSchemaRecord.schema.json'
import CacheableInputSource from '../src/autogen/schemas/CacheableInputSource.schema.json'
import CacheableDataResult from '../src/autogen/schemas/CacheableDataResult.schema.json'


describe('schema merging', () => {

    const schema1 = {
        title: 'schema1',
        type: 'object',
        properties: {
            funky: {
                type: 'string',
            },
        },
    }

    const schema2 = {
        title: 'schema2',
        type: 'object',
        properties: {
            monkey: {
                type: 'number',
            },
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
})

describe('data merging and splitting', () => {
    let entry1 = {
        foo: 'bar',
        nested1: {
            someNumber: 2,
            moreNested1: {
                weather: 'sunny',
                side: 'up',
            }
        }
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
            'namespace2/baz': 'quux',
            'namespace2/nested1.confusing': 'name',
            'namespace2/nested2.someFloat': 3.14,
            'namespace2/nested2.confusing': 'quux',
        })

        expect(splitNamespacedData(mergedData)).toMatchObject({
            namespace1: entry1,
            namespace2: entry2,
        })
    })
})