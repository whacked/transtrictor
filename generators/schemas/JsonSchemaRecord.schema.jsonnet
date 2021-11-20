{
  type: 'object',
  description: 'json schema referenced by data in CacheableDataWithSchema',
  properties: {
    id: {
      type: 'integer',
    },
    createdAt: {
      type: 'string',
    },
    sha256: {
      type: 'string',
    },
    description: {
      type: 'string',
    },
    content: {
      type: 'string',
    },
  },
  required: [
    'id',
    'createdAt',
    'sha256',
    'description',
    'content',
  ],
}
