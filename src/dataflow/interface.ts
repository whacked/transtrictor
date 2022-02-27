import { SchemaTaggedPayload } from "../autogen/interfaces/anthology/SchemaTaggedPayload";
import { AsyncInputOutputTransformerFunction } from "../jsvg-lib";


const CURRENT_PROTOCOL_VERSION = '2022-02-26.1'

export function toSchemaTaggedPayload(
    schemaName: string,
    schemaVersion: string | number,
    payload: Record<string, any>,
): SchemaTaggedPayload {
    return {
        schemaName,
        schemaVersion,
        data: payload,
        protocolVersion: CURRENT_PROTOCOL_VERSION,
    }
}

export function makeSchemaTaggedPayloadTransformerFunction<T>(
    schemaName: string, schemaVersion: string | number,
): AsyncInputOutputTransformerFunction<T, SchemaTaggedPayload> {
    return async function runTransformerWithValidation(inputData: T): Promise<SchemaTaggedPayload> {
        return toSchemaTaggedPayload(schemaName, schemaVersion, inputData)
    }
}

export class PayloadConformer<OutputInterface> {
    // build the input with makeReusableTransformerWithValidation
    constructor(public readonly transformerWithValidation: AsyncInputOutputTransformerFunction<
        SchemaTaggedPayload, OutputInterface
    >) {

    }

    async conform(payload: SchemaTaggedPayload): Promise<OutputInterface> {
        return this.transformerWithValidation(payload)
    }
}