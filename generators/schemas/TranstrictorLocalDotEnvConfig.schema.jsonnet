local urlPattern = 'https?://.+?:\\d+';

local transtrictorConfig = import '../../node_modules/schematized-config/autogen/schemas/ValidatorDotEnvConfig.schema.json';

local libPqConfig = {
  // see https://www.postgresql.org/docs/9.1/libpq-envars.html
  // linked from https://node-postgres.com/features/connecting

  PGUSER: {
    type: 'string',
    default: '$USER',
    examples: [
      'dbuser',
    ],
  },
  PGHOST: {
    type: 'string',
    default: 'localhost',
    examples: [
      'database.server.com',
      '127.0.0.1',
    ],
  },
  PGPASSWORD: {
    type: 'string',
    examples: [
      'secretpassword',
    ],
  },
  PGDATABASE: {
    type: 'string',
    examples: [
      'mydb',
    ],
  },
  PGPORT: {
    type: 'number',
    default: 5432,
    examples: [
      5432,
    ],
  },
};

local pouchDbConfig = {
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
};

local couchDbConfig = {
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
};

local arangoDbConfig = {
  ARANGODB_SERVER_URL: {
    type: 'string',
    pattern: urlPattern,
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
};

local sqliteDbConfig = {
  SQLITE_DATABASE_PATH: {
    type: 'string',
    examples: [
      ':memory:',
      '/tmp/transtrictor-data.sqlite',
    ],
  },
};

local rqliteDbConfig = {
  RQLITE_SERVER_ADDRESS: {
    type: 'string',
    examples: [
      'http://localhost:4001',
    ],
  },
};

{
  type: 'object',
  description: '.env config for transtrictor local utils (webserver, pouchdb)',
  properties: (
    {
      API_SERVER_PORT: {
        type: 'number',
        default: 1235,
        description: 'where the api server listens for requests',
      },
    }
    + transtrictorConfig.properties
    + pouchDbConfig
    + couchDbConfig
    + arangoDbConfig
    + libPqConfig
    + sqliteDbConfig
    + rqliteDbConfig
  ),
}
