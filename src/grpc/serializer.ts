/**
 * gRPC Serialization/Deserialization for Forthic types
 * Converts JavaScript values to/from protobuf StackValue format
 * Uses shared type detection from common/type_utils
 */

import { getForthicType } from "../common/type_utils.js";

// Type definitions matching the protobuf schema
interface StackValue {
  int_value?: number;
  string_value?: string;
  bool_value?: boolean;
  float_value?: number;
  null_value?: Record<string, never>;
  array_value?: ArrayValue;
  record_value?: RecordValue;
  instant_value?: InstantValue;
  plain_date_value?: PlainDateValue;
  zoned_datetime_value?: ZonedDateTimeValue;
}

interface ArrayValue {
  items: StackValue[];
}

interface RecordValue {
  fields: { [key: string]: StackValue };
}

interface InstantValue {
  iso8601: string;
}

interface PlainDateValue {
  iso8601_date: string;
}

interface ZonedDateTimeValue {
  iso8601: string;
  timezone: string;
}

/**
 * Serialize a JavaScript value to a StackValue protobuf message
 * Uses shared type detection and maps to protobuf format
 */
export function serializeValue(value: any): StackValue {
  const type = getForthicType(value);

  switch (type) {
    case 'null':
      return { null_value: {} };

    case 'boolean':
      return { bool_value: value };

    case 'integer':
      return { int_value: value };

    case 'float':
      return { float_value: value };

    case 'string':
      return { string_value: value };

    case 'array':
      return {
        array_value: {
          items: value.map((item: any) => serializeValue(item)),
        },
      };

    case 'record':
      const fields: { [key: string]: StackValue } = {};
      for (const [key, val] of Object.entries(value)) {
        fields[key] = serializeValue(val);
      }
      return { record_value: { fields } };

    case 'instant':
      return {
        instant_value: {
          iso8601: value.toString(),
        },
      };

    case 'plain_date':
      return {
        plain_date_value: {
          iso8601_date: value.toString(),
        },
      };

    case 'zoned_datetime':
      return {
        zoned_datetime_value: {
          iso8601: value.toString(),
          timezone: value.timeZoneId,
        },
      };

    default:
      throw new Error(`Unsupported Forthic type: ${type}`);
  }
}

/**
 * Deserialize a StackValue protobuf message to a JavaScript value
 */
export function deserializeValue(stackValue: StackValue): any {
  if ('int_value' in stackValue) {
    return stackValue.int_value;
  }

  if ('string_value' in stackValue) {
    return stackValue.string_value;
  }

  if ('bool_value' in stackValue) {
    return stackValue.bool_value;
  }

  if ('float_value' in stackValue) {
    return stackValue.float_value;
  }

  if ('null_value' in stackValue) {
    return null;
  }

  if ('instant_value' in stackValue && stackValue.instant_value) {
    return Temporal.Instant.from(stackValue.instant_value.iso8601);
  }

  if ('plain_date_value' in stackValue && stackValue.plain_date_value) {
    return Temporal.PlainDate.from(stackValue.plain_date_value.iso8601_date);
  }

  if ('zoned_datetime_value' in stackValue && stackValue.zoned_datetime_value) {
    // Parse ISO string which includes timezone information
    return Temporal.ZonedDateTime.from(stackValue.zoned_datetime_value.iso8601);
  }

  if ('array_value' in stackValue && stackValue.array_value) {
    return stackValue.array_value.items.map((item) => deserializeValue(item));
  }

  if ('record_value' in stackValue && stackValue.record_value) {
    const result: { [key: string]: any } = {};
    for (const [key, val] of Object.entries(stackValue.record_value.fields)) {
      result[key] = deserializeValue(val);
    }
    return result;
  }

  throw new Error('Unknown stack value type');
}
