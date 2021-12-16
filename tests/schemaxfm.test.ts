import { getSubSchema, mergeSchemas } from '../src/schemaxfm'
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
