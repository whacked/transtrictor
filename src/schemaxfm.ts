import { JSONSchema } from "json-schema-ref-parser";
import { flatten, unflatten } from 'flat'


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


const NAMESPACE_DELIMITER = '/'

export function mergeNamespacedData(namedMergeEntries: Record<string, any>) {
    let out = {}
    for (const namespace in namedMergeEntries) {
        let subData = namedMergeEntries[namespace]
        let flattenedSubData = flatten(subData)
        for (const key in flattenedSubData) {
            let namespacedKey = `${namespace}${NAMESPACE_DELIMITER}${key}`
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
        out[namespace] = unflatten(flattenedData)
    }
    return out
}