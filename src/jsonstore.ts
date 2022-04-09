import { Transformer } from './autogen/interfaces/anthology/2022/03/30/Transformer'


export abstract class JsonDatabase {

    schemas: any
    transformers: any
    schemaTaggedPayloads: any

    constructor() {

    }

    abstract findLatestMatchingSchema(schemaName: string)
    abstract transformPayload(
        transformerName: string,
        dataChecksum: string,
        context: any,
    )
    abstract putTransformer(transformerRecord: Transformer)
    abstract putSchema(schema: any)
    abstract getSchema(
        schemaName: string,
        schemaVersion: string,
    )
    abstract putSchemaTaggedPayload(schemaTaggedPayload: any)
}