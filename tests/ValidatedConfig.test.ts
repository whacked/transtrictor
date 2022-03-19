import { ValidatedConfig } from '../src/ValidatedConfig'


describe('test validated config', () => {

    const testSchema = {
        type: 'object',
        properties: {
            FOO: {
                type: 'string',
                default: 'bar'
            },
            BLUE: {
                type: 'number',
            },
            URL: {
                type: 'string',
            },
            DATABASE_NAME: {
                type: 'string',
            },
        },
        required: [
            'FOO',
            'DATABASE_NAME',
        ]
    }

    test('no schema, no input loads process.env', () => {
        const myConfig = ValidatedConfig.load()
    })

    test('no schema, with process.env', () => {
        const myConfig = ValidatedConfig.load(process.env)
    })

    test('empty schema = nothing allowed', () => {
        const myConfig = ValidatedConfig.setSchema({}).load()
        expect(myConfig).toEqual({})
    })

    test('schema constricting config keys in default', () => {
        const myConfig = ValidatedConfig.setSchema(testSchema).load()
        // expect(myConfig).toEqual({
        //     FOO: 'bar',
        //     BLUE: undefined,
        //     URL: undefined,
        //     DATABASE_NAME: '...',  <-- FIXME there's an .env in cwd now
        // })
    })

    test('load defaults: .env -> process.env, <strictness>, bail on schema violation', () => {
        // FIXME
    })

    test('load specific dotenv file -> process.env, <strictness>', () => {
        // FIXME
    })

    test('load specific dotenv file -> object, ...', () => {
        // FIXME
    })

    test('use arbitrary object', () => {
        const myConfig = ValidatedConfig.setSchema(testSchema).load({
            DATABASE_NAME: 'hello.db'
        })
        expect(myConfig).toEqual({
            FOO: 'bar',
            BLUE: undefined,
            URL: undefined,
            DATABASE_NAME: 'hello.db',
        })

        // FIXME
        // for this to throw, you must ensure .env isn't setting e.g. DATABASE_NAME
        // expect(() => {
        //     ValidatedConfig.setSchema(testSchema).load()
        // }).toThrowError()

        expect(() => {
            ValidatedConfig.setSchema(testSchema).load({})
        }).toThrowError()

        expect(() => {
            ValidatedConfig.setSchema(testSchema).load({
                DATABASE_NAME: 9,
            })
        }).toThrowError()
    })
})