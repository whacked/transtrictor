{
  type: 'object',
  properties: {
    id: {
      type: 'number',
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