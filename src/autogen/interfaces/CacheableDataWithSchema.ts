/* tslint:disable */
/**
 * This file was automatically generated by json-schema-to-typescript.
 * DO NOT MODIFY IT BY HAND. Instead, modify the source JSONSchema file,
 * and run json-schema-to-typescript to regenerate this file.
 */

/**
 * copy of actual data content taken from a given location, specified by CacheableInputSource
 */
export interface CacheableDataWithSchemaSchema {
  CacheableInputSource_id: number;
  JsonSchemaRecord_id?: number;
  content: string;
  createdAt: string;
  id: number;
  sha256: string;
  size: number;
  [k: string]: unknown;
}
