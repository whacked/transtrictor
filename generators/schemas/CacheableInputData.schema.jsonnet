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
    cachedDate: {
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
    'cachedDate',
    'sha256',
    'size',
  ],
}
