{
  type: 'object',
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