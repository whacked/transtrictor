import { SchemaTaggedPayload } from "../autogen/interfaces/anthology/SchemaTaggedPayload";
import { AsyncInputOutputTransformerFunction } from "../jsvg-lib";
import { toNamespacedFlattenedData } from "../schemaxfm";



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

export function makeSchemaTaggedPayloadTransformerFunction(
    schemaName: string, schemaVersion: string | number,
): AsyncInputOutputTransformerFunction<any, SchemaTaggedPayload> {
    return async function runTransformerWithValidation(inputData: any): Promise<SchemaTaggedPayload> {
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