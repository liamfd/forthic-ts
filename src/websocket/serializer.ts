/**
 * WebSocket JSON Serializer for Forthic
 * Mirrors gRPC serializer but outputs JSON instead of protobuf
 * Handles: int, float, string, bool, null, array, record, temporal types
 * Uses shared type detection from common/type_utils
 */

import { getForthicType } from "../common/type_utils.js";

// JSON StackValue format matching the WebSocket protocol
export interface StackValue {
  type: 'int' | 'float' | 'string' | 'bool' | 'null' | 'array' | 'record' | 'instant' | 'plain_date' | 'zoned_datetime';
  value: any;
}

/**
 * Serialize a JavaScript value to a JSON StackValue
 * Uses shared type detection and maps to JSON format
 */
export function serializeValue(value: any): StackValue {
  const type = getForthicType(value);

  switch (type) {
    case 'null':
      return { type: 'null', value: null };

    case 'boolean':
      return { type: 'bool', value };

    case 'integer':
      return { type: 'int', value };

    case 'float':
      return { type: 'float', value };

    case 'string':
      return { type: 'string', value };

    case 'array':
      return {
        type: 'array',
        value: value.map((item: any) => serializeValue(item)),
      };

    case 'record':
      const fields: { [key: string]: StackValue } = {};
      for (const [key, val] of Object.entries(value)) {
        fields[key] = serializeValue(val);
      }
      return {
        type: 'record',
        value: fields,
      };

    case 'instant':
      return {
        type: 'instant',
        value: value.toString(),
      };

    case 'plain_date':
      return {
        type: 'plain_date',
        value: value.toString(),
      };

    case 'zoned_datetime':
      return {
        type: 'zoned_datetime',
        value: value.toString(),
      };

    default:
      throw new Error(`Unsupported Forthic type: ${type}`);
  }
}

/**
 * Deserialize a JSON StackValue to a JavaScript value
 */
export function deserializeValue(stackValue: StackValue): any {
  switch (stackValue.type) {
    case 'int':
    case 'float':
    case 'string':
    case 'bool':
      return stackValue.value;

    case 'null':
      return null;

    case 'array':
      return (stackValue.value as StackValue[]).map((v) => deserializeValue(v));

    case 'record':
      return Object.entries(stackValue.value as Record<string, StackValue>).reduce(
        (acc, [k, v]) => {
          acc[k] = deserializeValue(v);
          return acc;
        },
        {} as Record<string, any>
      );

    case 'instant':
      return Temporal.Instant.from(stackValue.value as string);

    case 'plain_date':
      return Temporal.PlainDate.from(stackValue.value as string);

    case 'zoned_datetime':
      return Temporal.ZonedDateTime.from(stackValue.value as string);

    default:
      throw new Error(`Unknown stack value type: ${(stackValue as any).type}`);
  }
}

/**
 * Serialize an array of values (stack)
 */
export function serializeStack(stack: any[]): StackValue[] {
  return stack.map((value) => serializeValue(value));
}

/**
 * Deserialize an array of StackValues (stack)
 */
export function deserializeStack(stackValues: StackValue[]): any[] {
  return stackValues.map((value) => deserializeValue(value));
}
