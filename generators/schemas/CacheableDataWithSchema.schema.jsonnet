{
  type: 'object',
  description: 'copy of actual data content taken from a given location, specified by CacheableInputSource',
  properties: {
    id: {
      type: 'number',
    },
    JsonSchemaRecord_id: {
      type: 'number',
    },
    CacheableInputSource_id: {
      type: 'number',
    },
    createdAt: {
      type: 'string',
    },
    sha256: {
      type: 'string',
    },
    size: {
      type: 'number',
    },
    content: {
      type: 'string',
    },
  },
  required: [
    'id',
    'CacheableInputSource_id',
    'createdAt',
    'sha256',
    'size',
    'content',
  ],
}
