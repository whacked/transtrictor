{
  type: 'object',
  description: '.env config for transtrictor local utils (webserver, pouchdb)',
  properties: {
    POUCHDB_DATABASE_PREFIX: {
      examples: [
        ':memory:',
        '/tmp/cache/test-pdb',
      ],
      description: 'use :memory: or remove this item to use in-memory database',
      type: 'string',
    },
    EXPRESS_POUCHDB_LOG_PATH: {
      examples: [
        '/tmp/express-pouchdb.log',
      ],
      description: 'where the access logs for express-pouchdb should be saved',
      type: 'string',
      default: 'express-pouchdb.log',
    },
    API_SERVER_PORT: {
      type: 'number',
      default: 1235,
    },
  },
}
