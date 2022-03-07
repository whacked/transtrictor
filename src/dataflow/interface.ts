import { TypedSchemaTaggedPayload } from "../autogen/interfaces/anthology/2022/02/26/SchemaTaggedPayload";
import { CURRENT_PROTOCOL_VERSION } from "../defs";
import { AsyncInputOutputTransformerFunction } from "../jsvg-lib";


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
