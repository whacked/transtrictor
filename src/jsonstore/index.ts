import { SchemaTaggedPayload } from '../autogen/interfaces/anthology/2022/02/26/SchemaTaggedPayload'
import { Transformer } from '../autogen/interfaces/anthology/2022/03/30/Transformer'
import { CURRENT_PROTOCOL_VERSION } from '../defs'
import { makeTransformer, TransformerLanguage, unwrapTransformationContext, wrapTransformationContext } from '../transformer'
import { toSha256Checksum } from '../util'


export abstract class JsonDatabase {

    schemas: any
    transformers: any
    schemaTaggedPayloads: any

    constructor() {

    }

    abstract putSchema(schema: any)
    abstract getSchema(schemaName: string, schemaVersion: string)
    abstract findLatestMatchingSchema(schemaName: string)
    abstract putTransformer(transformerRecord: Transformer)
    abstract getTransformer(transformerName: string)
    abstract putSchemaTaggedPayload(schemaTaggedPayload: any)
    abstract getSchemaTaggedPayload(dataChecksum: string)

    async requireTransformer(transformerName: string) {
        let transformerRecord = await this.getTransformer(transformerName)
        if (transformerRecord == null) {
            throw new Error(`no transformer named ${transformerName}`)
        }
        return transformerRecord
    }

    async requireTransformerWithOutputSchema(transformerName) {
        let transformerRecord = await this.requireTransformer(transformerName)
        if (transformerRecord.outputSchema == null) {
            throw new Error(`transformer ${transformerName} has no output schema`)
        }
        return transformerRecord
    }

    async requireSchemaTaggedPayload(dataChecksum: string) {
        let payload = await this.getSchemaTaggedPayload(dataChecksum)
        if (payload == null) {
            throw new Error(`no data with checksum ${dataChecksum}`)
        }
        return payload
    }

    async requireSchema(schemaName: string, schemaVersion: string = null) {
        let schema = await this.getSchema(schemaName, null)
        if (schema == null) {
            throw new Error(`no output schema matching ${schemaName}`)
        }
        return schema
    }

    async transformPayload(
        transformerName: string, dataChecksum: string, context: any
    ): Promise<SchemaTaggedPayload> {
        let transformerRecord = await this.requireTransformerWithOutputSchema(transformerName)
        let payload = await this.requireSchemaTaggedPayload(dataChecksum)
        let outputSchema = await this.requireSchema(transformerRecord.outputSchema)

        let outputSchemaName = outputSchema.title
        let outputSchemaVersion = outputSchema.version

        let transformer = makeTransformer(transformerRecord.language as TransformerLanguage, transformerRecord.sourceCode)
        return transformer.transform(wrapTransformationContext(payload.data, context)).then((transformed) => {
            return unwrapTransformationContext<SchemaTaggedPayload>(transformed)
        }).then((unwrapped) => {
            const transformedDataChecksum = toSha256Checksum(unwrapped.data)
            // TAG WRAPPING HAPPENS HERE
            // FIXME: should the unwrapped be responsible for having the .data?
            // current usage makes the tnrasformer responsible for protocolVersion, schemaName etc.
            let schemaTaggedPayload: SchemaTaggedPayload = {
                protocolVersion: CURRENT_PROTOCOL_VERSION,
                dataChecksum: transformedDataChecksum,  // TODO test that post-transform checksum != input checksum (unless fixed point!?)
                createdAt: context['createdAt'] ?? Date.now() / 1e3,
                data: unwrapped.data,
                schemaName: outputSchemaName,
                schemaVersion: outputSchemaVersion,
            }
            return schemaTaggedPayload
        })
    }
}