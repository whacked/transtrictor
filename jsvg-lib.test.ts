import * as jsvg from './jsvg-lib'
import { JS, MorphismTransformer } from './jsvg-lib'
import * as path from 'path'
import * as fs from 'fs'

const TEST_DATA_DIR = path.join(__dirname, 'testdata')


function slurp(filePath: string) {
    return fs.readFileSync(filePath, 'utf-8')
}

function slurpTestData(testFileName: string) {
    return slurp(path.join(TEST_DATA_DIR, testFileName))
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

    const transformationInput = jsvg.wrapTransformationContext({
        foo: 'baz',
        bar: ['bar', 'foo'],
        baz: {
            qux: 'bazqux'
        }
    })

    let transformer = new MorphismTransformer({
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
        let output = jsvg.unwrapTransformationContext(transformed)
        expect(output).toMatchObject({
            foo: 'foo',
            bar: 'bar',
            bazqux: 'bazqux',
        })
    })

    return Promise.all([successCase, failureCase])
})