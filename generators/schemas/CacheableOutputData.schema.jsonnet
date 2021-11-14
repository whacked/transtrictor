{
  type: 'object',
  properties: {
    id: {
      type: 'number',
    },
    CacheableInputData_id: {
      type: 'number',
    },
    cachedDate: {
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
    'cachedDate',
    'sha256',
    'size',
    'content',
  ],
}
