{
  type: 'object',
  properties: {
    original: {
      type: 'object',
      properties: {
        tag: {
          type: 'string',
        },
        someNumber: {
          type: 'number',
        },
        tsconfig: {
          '$ref': 'https://json.schemastore.org/tsconfig.json',
        },
      },
    },
    someLargerNumber: {
      type: 'number',
    },
    hello: {
      type: 'string',
    },
  },
}
