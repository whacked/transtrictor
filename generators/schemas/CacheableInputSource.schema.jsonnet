{
  type: 'object',
  description: 'metadata for input data source -- not the actual data content',
  properties: {
    id: {
      type: 'integer',
    },
    owner_id: {
      type: 'integer',
    },
    sourcePath: {
      type: 'string',
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
  },
  required: [
    'id',
    'sourcePath',
    'createdAt',
    'sha256',
    'size',
  ],
}
