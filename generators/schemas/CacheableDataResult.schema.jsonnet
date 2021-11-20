{
  type: 'object',
  description: 'copy of actual data content taken from a given location, specified by CacheableInputSource',
  properties: {
    id: {
      type: 'integer',
    },
    JsonSchemaRecordSchema_id: {
      type: 'integer',
      description: 'describing/validating schema, if applicable',
    },
    CacheableInputSource_id: {
      type: 'integer',
      description: 'parent data source by metadata, if applicable',
    },
    CacheableDataResult_id: {
      type: 'integer',
      description: '(self join) parent data object containing source data, if applicable',
    },
    TransformerData_id: {
      type: 'integer',
      description: '(self join) parent data object containing transformer data that joins to metadata, if applicable',
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
    content: {
      type: 'string',
    },
  },
  required: [
    'id',
    'CacheableInputSource_id',
    'createdAt',
    'sha256',
    'size',
    'content',
  ],
}
