import * as jsvg from '../src/jsvg-lib'
import { JS } from '../src/jsvg-lib'
import {
    RawMorphismTransformer,
    unwrapTransformationContext,
    wrapTransformationContext
} from '../src/transformer'
import {
    cliMain
} from '../scripts/cli'
import { getTestFilePath, slurpTestData } from './common'


test('valid jsonnet input', async () => {
    const validJsonnet = slurpTestData('example-json-input-good.jsonnet')
    const testSchema = slurpTestData('example-json-schema.jsonnet')
    return jsvg.validateJsonnetWithSchema(validJsonnet, testSchema).then((result) => {
        expect(result.isValid).toBe(true)
    })
})

test('invalid jsonnet input', async () => {
    const invalidJsonnet = slurpTestData('example-json-input-bad.jsonnet')
    const testSchema = slurpTestData('example-json-schema.jsonnet')
    return jsvg.validateJsonnetWithSchema(invalidJsonnet, testSchema).then((result) => {
        expect(result.isValid).toBe(false)
    })
})

test('end to end transformer (morphism)', async () => {

    // morphism's example https://nobrainr.github.io/morphism/
    let inputSchema = JS.typeObject({
        foo: JS.typeString(),
        bar: JS.typeArray(JS.typeString()),
        baz: JS.typeObject({
            qux: JS.typeString(),
        })
    })

    let outputSchema = JS.typeObject({
        foo: JS.typeString(),
        bar: JS.typeString(),
        bazqux: JS.typeString(),
    })

    const transformationInput = wrapTransformationContext({
        foo: 'baz',
        bar: ['bar', 'foo'],
        baz: {
            qux: 'bazqux'
        }
    })

    let transformer = new RawMorphismTransformer({
        output: {
            foo: 'input.bar[1]', // Grab the property value by his path
            bar: {
                path: 'input.bar',
                fn: (iteratee, source, destination) => {
                    // Apply a Function on the current element
                    return iteratee[0];
                }
            },
            bazqux: {
                // Apply a function on property value
                path: 'input.baz.qux',
                fn: (propertyValue, source) => {
                    return propertyValue;
                }
            }
        }
    })

    let failureCase = expect(async () => {
        return jsvg.schema2SchemaTransform(
            inputSchema,
            JS.typeString(),
            transformationInput,
            transformer,
        )
    }).rejects.toThrow(jsvg.TargetValidationError)

    let successCase = jsvg.schema2SchemaTransform(
        inputSchema,
        outputSchema,
        transformationInput,
        transformer,
    ).then((transformed) => {
        let output = unwrapTransformationContext(transformed)
        expect(output).toMatchObject({
            foo: 'foo',
            bar: 'bar',
            bazqux: 'bazqux',
        })
    })

    return Promise.all([successCase, failureCase])
})

test('CLI post-transform schema validation', async () => {
    return cliMain({
        schema: getTestFilePath('example-json-schema.jsonnet'),
        input: getTestFilePath('example-json-input-good.jsonnet'),
        transformer: getTestFilePath('sample-transformer.jsonata'),
        postTransformSchema: getTestFilePath('example-post-transform-schema.jsonnet'),
        jsonLines: null,
    }).then((result) => {
        return expect(result).toMatchObject({
            original: {
                someNumber: 789,
                tag: 'some tag',
                tsconfig: {
                    compilerOptions: {
                        charset: 'utf-999',
                    }
                },
            },
            someLargerNumber: 5523,
            hello: 'goodbye'
        })
    })
})