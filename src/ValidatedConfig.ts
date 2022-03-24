import 'dotenv/config'
import { config } from 'dotenv'
import { resolve } from "path"
import dotenvExpand from 'dotenv-expand'
import Ajv from 'ajv'
import { JSONSchema7 } from "json-schema"


const processEnv = typeof process == "undefined" ? {} : process.env
const processCwd = typeof process == "undefined" ? null : process.cwd()


export enum ValidationStrictness {
    REQUIRE_FULL_CONFORMANCE,
    WARN_ON_NONCONFORMANCE,
    UNSTRICT,
}

export class ValidatedConfig {

    static defaultConfigSourcePath = resolve(processCwd, ".env")  // FIXME for non-node interop?
    static configSchema: JSONSchema7 = null

    static setSchema(jsonSchemaObject: JSONSchema7 | Record<string, any>) {
        ValidatedConfig.configSchema = jsonSchemaObject as JSONSchema7
        return ValidatedConfig
    }

    static loadDefaults<ConfigSchema>(schema: JSONSchema7): ConfigSchema {
        /**
         * load properties with "default": value set from a json schema
         * and return it in an object
         */
        let out = <ConfigSchema>{}
        if (schema?.properties == null) {
            return out
        }
        Object.keys(schema.properties).forEach((key) => {
            let itemConfig = schema.properties[key] as JSONSchema7
            if (itemConfig.type == "object") {
                out[key] = ValidatedConfig.loadDefaults(itemConfig)
            } else if (itemConfig.default) {
                out[key] = itemConfig.default
            }
        })
        return out
    }

    static loadDotEnvFile<ConfigSchema>(
        dotEnvFilePath: string = ValidatedConfig.defaultConfigSourcePath,
        strictnessLevel: ValidationStrictness = ValidationStrictness.WARN_ON_NONCONFORMANCE,
    ) {
        return ValidatedConfig.load<ConfigSchema>(
            dotenvExpand(config({ path: dotEnvFilePath })).parsed, strictnessLevel,
        )
    }

    static load<ConfigSchema>(
        configSource: Object | ValidationStrictness = null,
        strictnessLevel: ValidationStrictness = null,
    ): ConfigSchema {
        let incomingConfig: object

        if (configSource == null) {  // called with no arguments
            incomingConfig = processEnv
            strictnessLevel = ValidationStrictness.UNSTRICT
        } else if (typeof configSource != "object") {
            incomingConfig = processEnv
        } else {
            incomingConfig = configSource
        }

        let ajv = new Ajv()
        if (ValidatedConfig.configSchema == null) {
            console.warn('WARN: no schema is set; output will be the default config as-is')
            return processEnv as any
        }
        let validator = ajv.compile(ValidatedConfig.configSchema ?? {})
        let mergedConfig = ValidatedConfig.loadDefaults<ConfigSchema>(ValidatedConfig.configSchema)

        let incomingConfigKeyErrors = []
        Object.keys(ValidatedConfig.configSchema?.properties || {}).forEach((key) => {
            let value = incomingConfig[key]  // FIXME: what to do about this and (process.env || env[key])?
            switch (ValidatedConfig.configSchema.properties[key]['type']) {
                case 'number':
                    let parsedValue = Number(value)
                    if (value != null && Number.isNaN(parsedValue)) {
                        incomingConfigKeyErrors.push(`FAILED TO PARSE NUMBER for ${key}: ${value}`)
                    }
                    value = parsedValue
                    break;
                case 'boolean':
                    try {
                        value = JSON.parse(value)
                    } catch (e) {
                        incomingConfigKeyErrors.push(`FAILED TO PARSE BOOLEAN for ${key}: ${value}`)
                    }
                    break;
                default:
                    break;
            }
            mergedConfig[key] = (value != null && !Number.isNaN(value)) ? value : mergedConfig[key]
        })

        if (incomingConfigKeyErrors.length > 0) {
            switch (strictnessLevel) {
                case ValidationStrictness.REQUIRE_FULL_CONFORMANCE:
                    for (const warning of incomingConfigKeyErrors) {
                        console.warn(warning)
                    }
                    throw new Error('full conformance failed')
                    break
                case ValidationStrictness.WARN_ON_NONCONFORMANCE:
                    for (const warning of incomingConfigKeyErrors) {
                        console.warn(warning)
                    }
                    break
                default:
                    break
            }
        }

        validator(mergedConfig)
        if (validator.errors) {
            validator.errors.forEach((error) => {
                console.warn(`VALIDATION FAILURE:`, error)
            })
            throw new Error(`failed to validate schema on start`)
        }

        if (strictnessLevel == ValidationStrictness.WARN_ON_NONCONFORMANCE) {
            let inputKeys = Object.keys(incomingConfig || {})
            let mergedConfigKeys = Object.keys(mergedConfig)

            let showKeyLength: number = inputKeys.concat(mergedConfigKeys).reduce((maxLength, curLength) => {
                return Math.max(maxLength, curLength.length)
            }, 0)

            mergedConfigKeys.forEach((key) => {
                if (!incomingConfig[key]) {
                    let useDefault = mergedConfig[key] ? ` => using default: ${mergedConfig[key]}` : ''
                    console.warn(`!!! WARNING !!!\t${key.padEnd(showKeyLength, ' ')} exists in schema but not in env  ${useDefault}`)
                }
            })

            inputKeys.forEach((key) => {
                if (!mergedConfig[key]) {
                    console.warn(`!!! WARNING !!!\t${key.padEnd(showKeyLength, ' ')} exists in env   but not in schema`)
                }
            })
        }

        return mergedConfig
    }
}