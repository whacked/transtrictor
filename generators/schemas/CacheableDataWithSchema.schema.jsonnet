{
  type: 'object',
  description: 'copy of actual data content taken from a given location, specified by CacheableInputSource',
  properties: {
    id: {
      type: 'integer',
    },
    JsonSchemaRecordSchema_id: {
      type: 'integer',
    },
    CacheableInputSource_id: {
      type: 'integer',
    },
    createdAt: {
      type: 'string',
    },
    sha256: {
      type: 'string',
    },
    size: {
      type: 'integer',
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
