/* tslint:disable */
/**
 * This file was automatically generated by json-schema-to-typescript.
 * DO NOT MODIFY IT BY HAND. Instead, modify the source JSONSchema file,
 * and run json-schema-to-typescript to regenerate this file.
 */

/**
 * .env config for transtrictor local utils (webserver, pouchdb)
 */
export interface TranstrictorLocalDotEnvConfigSchema {
  /**
   * where the api server listens for requests
   */
  API_SERVER_PORT?: number;
  ARANGODB_AUTH_PASSWORD?: string;
  ARANGODB_AUTH_USERNAME?: string;
  ARANGODB_SERVER_URL?: string;
  COUCHDB_AUTH_PASSWORD?: string;
  COUCHDB_AUTH_USERNAME?: string;
  COUCHDB_SERVER_URL?: string;
  /**
   * where the access logs for express-pouchdb should be saved
   */
  EXPRESS_POUCHDB_LOG_PATH?: string;
  PGDATABASE?: string;
  PGHOST?: string;
  PGPASSWORD?: string;
  PGPORT?: number;
  PGUSER?: string;
  /**
   * use :memory: or remove this item to use in-memory database
   */
  POUCHDB_DATABASE_PREFIX?: string;
  SQLITE_DATABASE_PATH?: string;
  [k: string]: unknown;
}
