{
  type: 'object',
  description: 'metadata for input data source -- not the actual data content',
  properties: {
    id: {
      type: 'number',
    },
    owner_id: {
      type: 'number',
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
      type: 'number',
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
