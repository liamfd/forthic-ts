/**
 * Shared type detection utilities for Forthic value serialization
 * Used by both gRPC and WebSocket serializers
 */

import { isPlainDate, isInstant, isZonedDateTime } from './temporal_utils.js';

/**
 * Forthic value types
 */
export type ForthicType =
  | 'null'
  | 'boolean'
  | 'integer'
  | 'float'
  | 'string'
  | 'array'
  | 'record'
  | 'instant'
  | 'plain_date'
  | 'zoned_datetime';

/**
 * Get the Forthic type of a JavaScript value
 * Determines the correct serialization type for a value
 *
 * IMPORTANT: Order matters!
 * - Check temporal types BEFORE primitives (they're objects)
 * - Check ZonedDateTime BEFORE Instant (ZonedDateTime may match isInstant)
 * - Check boolean BEFORE number (to avoid typeof confusion)
 * - Check array BEFORE object (arrays are objects)
 */
export function getForthicType(value: any): ForthicType {
  // Handle null/undefined
  if (value === null || value === undefined) {
    return 'null';
  }

  // Handle Temporal types (check ZonedDateTime BEFORE Instant)
  if (isZonedDateTime(value)) {
    return 'zoned_datetime';
  }

  if (isInstant(value)) {
    return 'instant';
  }

  if (isPlainDate(value)) {
    return 'plain_date';
  }

  // Handle boolean (check before number)
  if (typeof value === 'boolean') {
    return 'boolean';
  }

  // Handle number (distinguish integer vs float)
  if (typeof value === 'number') {
    return Number.isInteger(value) ? 'integer' : 'float';
  }

  // Handle string
  if (typeof value === 'string') {
    return 'string';
  }

  // Handle array (check before object)
  if (Array.isArray(value)) {
    return 'array';
  }

  // Handle object/record
  if (typeof value === 'object') {
    return 'record';
  }

  throw new Error(`Unsupported value type: ${typeof value}`);
}

/**
 * Check if a value is a temporal type
 */
export function isTemporalType(value: any): boolean {
  return isInstant(value) || isPlainDate(value) || isZonedDateTime(value);
}

/**
 * Check if a value is a primitive type (not array or record)
 */
export function isPrimitive(value: any): boolean {
  const type = getForthicType(value);
  return type !== 'array' && type !== 'record';
}

/**
 * Check if a value is a container type (array or record)
 */
export function isContainer(value: any): boolean {
  const type = getForthicType(value);
  return type === 'array' || type === 'record';
}
