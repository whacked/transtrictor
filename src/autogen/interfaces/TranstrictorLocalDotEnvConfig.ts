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
  API_SERVER_PORT?: number;
  /**
   * where the access logs for express-pouchdb should be saved
   */
  EXPRESS_POUCHDB_LOG_PATH?: string;
  /**
   * use :memory: or remove this item to use in-memory database
   */
  POUCHDB_DATABASE_PREFIX?: string;
  [k: string]: unknown;
}
