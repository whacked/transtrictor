/* tslint:disable */
/**
 * This file was automatically generated by json-schema-to-typescript.
 * DO NOT MODIFY IT BY HAND. Instead, modify the source JSONSchema file,
 * and run json-schema-to-typescript to regenerate this file.
 */

/**
 * copy of actual data content taken from a given location, specified by CacheableInputSource
 */
export interface CacheableDataResultSchema {
  /**
   * (self join) parent data object containing source data, if applicable
   */
  CacheableDataResult_id?: number;
  /**
   * parent data source by metadata, if applicable
   */
  CacheableInputSource_id: number;
  /**
   * describing/validating schema, if applicable
   */
  JsonSchemaRecordSchema_id?: number;
  /**
   * (self join) parent data object containing transformer data that joins to metadata, if applicable
   */
  TransformerData_id?: number;
  content: string;
  createdAt: string;
  id: number;
  sha256: string;
  size: number;
  [k: string]: unknown;
}
