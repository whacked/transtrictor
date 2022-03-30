{
  title: 'Transformer',
  version: '2022-03-30.1',
  type: 'object',
  required: [
    'language',
    'sourceCode',
    'sourceCodeChecksum',
  ],
  properties: {
    name: {
      type: 'string',
    },
    language: {
      type: 'string',
      enum: [
        'jq',
        'jsonata',
        'jsonnet',
        'morphism',
      ],
    },
    sourceCode: {
      type: 'string',
    },
    sourceCodeChecksum: {
      type: 'string',
      examples: [
        'sha256:d7946e0aa58456d44fdc86eb25877d9e8008a98c76c073df526a193da293eae1',
      ],
    },
    supportedInputSchemas: {
      type: 'array',
      items: {
        type: 'string',
        examples: [
          'InputDataSchema@2022-02-03.4',
        ],
      },
    },
    outputSchema: {
      type: 'string',
      examples: [
        'OutputDataSchema@2021-01-02.3',
      ],
    },
  },
}
