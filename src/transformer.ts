import jsonata from 'jsonata';
import { Jsonnet } from "@hanazuki/node-jsonnet";
import Ajv, { ValidateFunction } from 'ajv';
import * as jq from 'node-jq'
import * as col from 'colorette';
import fs from 'fs'
import { last } from 'lodash';
import { morphism } from 'morphism'


export function slurp(filePath: string): string {
    return fs.readFileSync(filePath, 'utf-8')
}


export interface IWrappedDataContext {
    input: Object;
    output?: Object;
    [key: string]: Object;
}

export function wrapTransformationContext(transformableData: Object, context: Object = {}): IWrappedDataContext {
    /**
     * transformers are expected to work on f(data) --> data'
     * 
     * transformations MUST always happen in the wrapped data context.
     * transformers will receive incoming data wrapped in a
     * {
     *  "input": originalData,
     *   ...otherStuff
     * }
     * object; and when finished, the output is expected to be wrapped
     * in an output key:
     * {
     *   "output": transformedData
     * }
     * 
     * since transformers may require additional context, like the verison-dependent
     * transformers, they must always operate in an "input/output data space".
     * context information includes e.g. username, application version, design, config...
     * 
     * input data is indexed by the "input" key, which takes the value of either the
     *   original data, or the current used-as-origin transformed data value.
     * output must be indexed by the "output" key.
     * 
     * this should query user permissions later to determine what values to propagate
     */

    return {
        ...context,
        input: transformableData,
    }
}

export function unwrapTransformationContext(wrappedDataContext: IWrappedDataContext) {
    if (wrappedDataContext.output == null) {
        console.warn(col.bgRed(col.white('WARNING: wrapped data has no "output" field')))
    }
    return wrappedDataContext.output
}

export function bailIfValidationError(validator: ValidateFunction, comment: string, ...anythingElse) {
    if (validator.errors) {
        validator.errors.forEach((error) => {
            console.error(col.bgRed(col.yellow(' AJV ERROR ')), error)
        })
        anythingElse.forEach((thing) => {
            console.log(thing)
        })
        throw new Error(`failed to validate for: ${comment}`)
    }
}

export async function transformWithJq(inputData: IWrappedDataContext, jqFilter: string): Promise<IWrappedDataContext> {
    console.log('jq running with', jqFilter, 'and input', inputData)
    // you can use input: json, but apparently it only takes an Object and disallows Array
    return jq.run(
        jqFilter,
        JSON.stringify(inputData),
        { input: 'string', output: 'json' }
    ).then((outputData) => {
        return outputData
    }).catch((err) => {
        console.error(err)
        return null
    })
}

export async function transformWithJsonnet(inputData: IWrappedDataContext, jsonnetSnippet: string): Promise<IWrappedDataContext> {
    return new Jsonnet()
        .extString('inputJson', JSON.stringify(inputData))
        .evaluateSnippet(jsonnetSnippet)
        .then((json) => {
            return <IWrappedDataContext>JSON.parse(json)
        }).catch((err) => {
            console.error(err)
            return null
        })
}

export async function transformWithJsonata(inputData: IWrappedDataContext, expressionString: string): Promise<IWrappedDataContext> {
    return new Promise((resolve, reject) => {
        const outputData = jsonata(expressionString).evaluate(inputData)
        resolve(<IWrappedDataContext>outputData);
    })
}

export async function transformWithMorphismJsonString(inputData: IWrappedDataContext, morphismJsonString: string): Promise<IWrappedDataContext> {
    return new Promise((resolve, reject) => {
        const morphismSchema = JSON.parse(morphismJsonString)
        const outputData = morphism(morphismSchema, inputData) as IWrappedDataContext
        resolve(<IWrappedDataContext>outputData);
    })
}

export enum TransformerLanguage {
    Jsonnet = "jsonnet",
    Jsonata = "jsonata",
    Jq = "jq",
    Morphism = 'morphism',
}

export interface IDataTransformer {
    transform: (input: IWrappedDataContext) => Promise<IWrappedDataContext>
}

export abstract class Transformer implements IDataTransformer {
    language: TransformerLanguage;
    sourceCode: string;
    transformerFunction: (inputData: IWrappedDataContext, sourceCode: string) => any;

    static readonly functionLookup: Record<TransformerLanguage, (inputData: IWrappedDataContext, sourceCode: string) => any> = {
        [TransformerLanguage.Jq]: transformWithJq,
        [TransformerLanguage.Jsonata]: transformWithJsonata,
        [TransformerLanguage.Jsonnet]: transformWithJsonnet,
        [TransformerLanguage.Morphism]: transformWithMorphismJsonString,
    };

    constructor(language: TransformerLanguage, sourceCode: string) {
        this.language = language;
        this.sourceCode = sourceCode;
        this.transformerFunction = Transformer.functionLookup[this.language];
    }

    async transform(inputData: IWrappedDataContext) {
        try {
            return this.transformerFunction(inputData, this.sourceCode)
        } catch (e) {
            console.error(col.bgRed(col.white(`ERROR: failed to transform`)), e)
            console.log('input', JSON.stringify(inputData))
            console.log('source', this.sourceCode)
            return null
        }
    }
}

export class JsonnetTransformer extends Transformer {
    constructor(definition: string) {
        super(TransformerLanguage.Jsonnet, definition)
    }
}

export class JsonataTransformer extends Transformer {
    constructor(definition: string) {
        super(TransformerLanguage.Jsonata, definition)
    }
}

export class JqTransformer extends Transformer {
    constructor(definition: string) {
        super(TransformerLanguage.Jq, definition)
    }
}

export class MorphismTransformer extends Transformer {
    language: TransformerLanguage.Morphism

    constructor(morphismJsonSource: string) {
        super(TransformerLanguage.Morphism, morphismJsonSource)
    }
}

export class RawMorphismTransformer implements IDataTransformer {
    constructor(public readonly schema: object) { }

    async transform(inputData: IWrappedDataContext) {
        return morphism(this.schema, inputData) as IWrappedDataContext
    }
}

export function makeTransformer(language: TransformerLanguage, content: string): Transformer {
    const classLookup: Record<TransformerLanguage | string, any> = {
        [TransformerLanguage.Jq]: JqTransformer,
        [TransformerLanguage.Jsonata]: JsonataTransformer,
        [TransformerLanguage.Jsonnet]: JsonnetTransformer,
        [TransformerLanguage.Morphism]: MorphismTransformer,
        json: MorphismTransformer,
    };
    let cls = classLookup[language]
    return new cls(content)
}

export function runValidator(validatorSchema: string | object, targetData: Object, shouldBailIfError: boolean = false, bailWithMessage: string = null) {
    const ajv = new Ajv()
    let validator = ajv.compile(typeof validatorSchema == "object" ? validatorSchema : JSON.parse(<string>validatorSchema))
    validator(targetData)
    if (shouldBailIfError) {
        bailIfValidationError(validator, bailWithMessage || 'target data', targetData)
    }
    return validator
}

export async function applyValidatedTransform(inputData, inputSchema, outputSchema, transformer: Transformer) {
    // note this no longer works with a cfData or cfData.data input as-is because
    // - the schemas validate the "data" object
    // - the transformers expect the full data object (.data, .config, .username, .version, etc)
    const ajv = new Ajv()
    const inputValidator = runValidator(inputSchema, inputData, true)
    console.info('applying transform with', transformer)
    const outputData = await transformer.transform(inputData)
    const outputValidator = runValidator(outputSchema, outputData)
    return outputData
}

export function loadTransformerFile(filePath: string): Transformer {
    if (!fs.existsSync(filePath)) {
        throw new Error(`no such file: ${filePath}`)
    }

    let fileExtension = <TransformerLanguage>last(filePath.split('.')).toLowerCase()
    return makeTransformer(fileExtension, fs.readFileSync(filePath, "utf-8"))
}
