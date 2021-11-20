{
  type: 'object',
  properties: {
    id: {
      type: 'number',
    },
    JsonSchemaRecord_id: {
      type: 'number',
    },
    CacheableInputData_id: {
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
    'CacheableInputData_id',
    'createdAt',
    'sha256',
    'size',
    'content',
  ],
}
