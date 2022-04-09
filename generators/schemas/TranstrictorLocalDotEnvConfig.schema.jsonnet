local urlPattern = 'https?://.+?:\\d+';

{
  type: 'object',
  description: '.env config for transtrictor local utils (webserver, pouchdb)',
  properties: {
    API_SERVER_PORT: {
      type: 'number',
      default: 1235,
      description: 'where the api server listens for requests',
    },

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

    COUCHDB_SERVER_URL: {
      type: 'string',
      pattern: urlPattern,
      examples: [
        'http://localhost:5984',
      ],
    },
    COUCHDB_AUTH_USERNAME: {
      type: 'string',
    },
    COUCHDB_AUTH_PASSWORD: {
      type: 'string',
    },

    ARANGODB_SERVER_URL: {
      type: 'string',
      pattern: urlPattern,
      default: 'http://localhost:8529',
      examples: [
        'http://localhost:8529',
      ],
    },
    ARANGODB_AUTH_USERNAME: {
      type: 'string',
    },
    ARANGODB_AUTH_PASSWORD: {
      type: 'string',
    },

    SQLITE_DATABASE_PATH: {
      type: 'string',
      examples: [
        ':memory:',
        '/tmp/transtrictor-data.sqlite',
      ],
    },
  },
}
