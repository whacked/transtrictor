{
  version: '2022-02-26.1',
  '$defs': {
    FileInfo: {
      type: 'object',
      required: ['filepath', 'size', 'mtime'],
      properties: {
        name: {
          type: 'string',
        },
        filepath: {
          type: 'string',
        },
        mtime: {
          type: 'number',
          description: 'milliseconds',
        },
        size: {
          type: 'number',
        },
        fileSha256: {
          type: 'string',
        },
      },
    },
  },
}
