import * as jsvg from './jsvg-lib'
import { JS } from './jsvg-lib'
import * as path from 'path'
import {
    RawMorphismTransformer,
    slurp,
    unwrapTransformationContext,
    wrapTransformationContext
} from './transformer'
import {
    cliMain
} from '../scripts/cli'

const TEST_DATA_DIR = path.join(__dirname, 'testdata')


function getTestFilePath(testFileName: string): string {
    return path.join(TEST_DATA_DIR, testFileName)
}

function slurpTestData(testFileName: string) {
    return slurp(getTestFilePath(testFileName))
}


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