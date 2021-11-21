{
  type: 'object',
  description: 'MUTABLE metadata for input data source -- not the actual data content',
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
    updatedAt: {
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
    'updatedAt',
    'sha256',
    'size',
  ],
}
