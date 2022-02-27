import { TypedSchemaTaggedPayload } from "../autogen/interfaces/anthology/SchemaTaggedPayload";
import { AsyncInputOutputTransformerFunction } from "../jsvg-lib";


const CURRENT_PROTOCOL_VERSION = '2022-02-26.1'

export function toSchemaTaggedPayload<TypeOrInputInterface>(
    schemaName: string,
    schemaVersion: string | number,
    payload: TypeOrInputInterface,
): TypedSchemaTaggedPayload<TypeOrInputInterface> {
    return {
        schemaName,
        schemaVersion,
        data: payload,
        protocolVersion: CURRENT_PROTOCOL_VERSION,
    }
}

export function makeSchemaTaggedPayloadTransformerFunction<InputInterface>(
    schemaName: string, schemaVersion: string | number,
): AsyncInputOutputTransformerFunction<InputInterface, TypedSchemaTaggedPayload<InputInterface>> {
    return async function runTransformerWithValidation(inputData: InputInterface): Promise<TypedSchemaTaggedPayload<InputInterface>> {
        return toSchemaTaggedPayload(schemaName, schemaVersion, inputData)
    }
}

// this does nothing but class-ifies transformerWithValidation
// unclear whether truly useful; consider removal
export class PayloadConformer<InputInterface, OutputInterface> {
    // build the input with makeReusableTransformerWithValidation
    constructor(public readonly transformerWithValidation: AsyncInputOutputTransformerFunction<
        TypedSchemaTaggedPayload<InputInterface>, OutputInterface
    >) {

    }

    async conform(payload: TypedSchemaTaggedPayload<InputInterface>): Promise<OutputInterface> {
        return this.transformerWithValidation(payload)
    }
}