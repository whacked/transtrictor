{
  definitions: {
    localDefinition: {
      type: 'number',
    },
    remoteTsConfig: {
    },
  },

  type: 'object',
  properties: {
    tag: {
      type: 'string',
    },
    someNumber: {
      '$ref': '#/definitions/localDefinition',
    },
    tsconfig: {
      '$ref': 'https://json.schemastore.org/tsconfig.json',
    },
  },
}
