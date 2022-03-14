import { JSONSchema } from "json-schema-ref-parser";
import { flatten, unflatten } from 'flat'
import Ajv, { ValidateFunction } from 'ajv';
import { bailIfValidationError } from "./transformer";


const NAMESPACE_DELIMITER = '/'
const SUBKEY_DELIMITER = '.'  // same as flat default

export function getSubSchema(scm) {
    let {
        title,
        ...rest
    } = scm
    return rest
}

function _mergeNamedSchemas(mapping: Record<string, JSONSchema>): JSONSchema {
    let out = {}
    let addedNamespaces = []
    for (const namespace in mapping) {
        addedNamespaces.push(namespace)
        let schema = mapping[namespace]
        out[namespace] = {
            type: 'object',
            properties: schema.properties,
        }
    }
    return {
        description: `merged schemas: ${addedNamespaces.join(', ')}`,
        type: 'object',
        properties: out,
    }
}

function _mergeArrayOfSchemas(schemas: Array<JSONSchema>): JSONSchema {
    let mapping: Record<string, JSONSchema> = {}
    for (const schema of schemas) {
        mapping[schema.title] = schema
    }
    return _mergeNamedSchemas(mapping)
}


export function mergeSchemas(...args: Array<any>): JSONSchema {
    if (args.length == 0) {
        return {}
    }
    if (args.length == 1) {
        if (args[0].properties != null) {
            console.debug('single object arg with properties; treating as single json schema')
            return args[0]
        } else {
            console.debug('single object arg without properties; treating as named mapping of schemas')
            return _mergeNamedSchemas(args[0])
        }
    } else {
        console.debug('received arg array; treating as array of named schemas')
        for (let i = 0; i < args.length; ++i) {
            let schema = args[i]
            if (schema.title == null) {
                throw new Error(`argument ${i} in inputs does not have a 'title' field, which is required for this invocation`)
            }
        }
        return _mergeArrayOfSchemas(args)
    }
}

function _namespacedKey(namespace: string, subkey: string) {
    return `${namespace}${NAMESPACE_DELIMITER}${subkey}`
}

export function getFlattenedSchema(schema: JSONSchema): JSONSchema {
    let out: JSONSchema = {
        properties: {},
    }
    for (const propKey in schema.properties) {
        let propDef = schema.properties[propKey] as any
        switch (propDef.type) {
            case 'object':
                let subSchema = getFlattenedSchema(propDef)
                for (const subPropKey in subSchema.properties) {
                    let subKey = `${propKey}${SUBKEY_DELIMITER}${subPropKey}`
                    out.properties[subKey] = subSchema.properties[subPropKey]
                }
                break
            default:
                out.properties[propKey] = propDef
        }
    }

    return out
}

export function getFlattenedNamespacedSchema(...args: Array<any>): JSONSchema {
    let out = {
        properties: {},
    }
    let mergedSchema = mergeSchemas(...args)
    for (const namespace in mergedSchema.properties) {
        let flattenedSubSchema = getFlattenedSchema(mergedSchema.properties[namespace] as any)
        for (const subKey in flattenedSubSchema.properties) {
            let namespacedKey = _namespacedKey(namespace, subKey)
            out.properties[namespacedKey] = flattenedSubSchema.properties[subKey]
        }
    }
    return out
}

export function toNamespacedFlattenedData(namespace: string, data: Record<string, any>) {
    return Object.fromEntries(Object.entries(
        flatten(data, {
            delimiter: SUBKEY_DELIMITER,
            safe: true,
        })
    ).map(([key, val]) => {
        return [_namespacedKey(namespace, key), val]
    }))
}

export function mergeNamespacedData(namedMergeEntries: Record<string, any>) {
    let out = {}
    for (const namespace in namedMergeEntries) {
        let subData = namedMergeEntries[namespace]
        let flattenedSubData = flatten(subData, {
            delimiter: SUBKEY_DELIMITER,
            safe: true,
        })
        for (const key in flattenedSubData) {
            let namespacedKey = _namespacedKey(namespace, key)
            out[namespacedKey] = flattenedSubData[key]
        }
    }
    return out
}

export function splitNamespacedData(namespacedData: any) {
    let out = {}
    for (const key in namespacedData) {
        let [namespace, subkey] = key.split(NAMESPACE_DELIMITER, 2)
        if (out[namespace] == null) {
            out[namespace] = {}
        }
        out[namespace][subkey] = namespacedData[key]
    }

    for (const namespace in out) {
        let flattenedData = out[namespace]
        out[namespace] = unflatten(flattenedData, {
            delimiter: SUBKEY_DELIMITER,
            safe: true,
        })
    }
    return out
}

export function verifyDataMatchesSchema<T>(data: any, jsonSchema: any): T {  // convenience function to validate and type-cast to T
    bailIfValidationError(jsonSchema, 'input data did not match schema')
    return data as T
}

export abstract class InterfaceWithSchema<T> {
    validator: ValidateFunction
    flattenedSchema: JSONSchema

    constructor(public readonly schema: any) {
        const ajv = new Ajv()
        this.validator = ajv.compile(this.schema)
        this.flattenedSchema = getFlattenedSchema(this.schema)
    }

    setAttributesInPlace(source: T, mutationTarget: any, namespacePrefix: string = null) {
        this.validator(source)
        bailIfValidationError(this.validator, 'source attributes failed to validate')

        let result = {}

        let flattenedSource = flatten(source, {
            delimiter: SUBKEY_DELIMITER,
            safe: true,
        })

        for (const flattenedKey in this.flattenedSchema.properties) {
            result[flattenedKey] = flattenedSource[flattenedKey]
        }

        this.validator(result)
        bailIfValidationError(this.validator, 'ouput failed to validate')
        if (namespacePrefix != null) {
            for (const key in result) {
                mutationTarget[_namespacedKey(namespacePrefix, key)] = result[key]
            }
        } else {
            Object.assign(mutationTarget, result)
        }
    }

    setAttributes(source: T, target: any, namespacePrefix: string = null) {
        let out = { ...target }
        this.setAttributesInPlace(source, out, namespacePrefix)
        return out
    }
}
