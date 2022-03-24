{
  title: 'SchemaTaggedPayload',
  version: '2022-02-26.1',
  type: 'object',
  required: ['data', 'protocolVersion', 'schemaName', 'schemaVersion'],
  properties: {
    data: {
      tsType: 'any',
      type: ['string', 'number', 'boolean', 'array', 'object'],
    },

    name: { type: 'string' },
    protocolVersion: { type: ['string', 'number'] },
    schemaName: { type: 'string' },
    schemaVersion: { type: ['string', 'number'] },

    schemaUrl: { type: 'string' },

    id: { type: ['string', 'number'] },
    accessControlPolicy: { type: 'string' },
    applicationVersion: { type: ['string', 'number'] },
    batch: { type: ['string'] },
    createdAt: { type: ['string', 'number'] },
    creator: { type: ['string'] },
    device: { type: 'string' },
    fingerprint: { type: 'string' },
    isPreprocessed: { type: 'boolean' },
    project: { type: ['string'] },
  },
}
