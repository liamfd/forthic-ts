/**
 * Unit tests for WebSocket JSON serializer
 */
import { serializeValue, deserializeValue, serializeStack, deserializeStack, type StackValue } from '../../../../websocket/serializer.js';

describe('WebSocket Serializer', () => {
  describe('Basic types', () => {
    test('serialize/deserialize null', () => {
      const value = null;
      const serialized = serializeValue(value);
      expect(serialized).toEqual({ type: 'null', value: null });
      expect(deserializeValue(serialized)).toBe(null);
    });

    test('serialize/deserialize undefined as null', () => {
      const value = undefined;
      const serialized = serializeValue(value);
      expect(serialized).toEqual({ type: 'null', value: null });
      expect(deserializeValue(serialized)).toBe(null);
    });

    test('serialize/deserialize integer', () => {
      const value = 42;
      const serialized = serializeValue(value);
      expect(serialized).toEqual({ type: 'int', value: 42 });
      expect(deserializeValue(serialized)).toBe(42);
    });

    test('serialize/deserialize float', () => {
      const value = 3.14159;
      const serialized = serializeValue(value);
      expect(serialized).toEqual({ type: 'float', value: 3.14159 });
      expect(deserializeValue(serialized)).toBe(3.14159);
    });

    test('serialize/deserialize string', () => {
      const value = 'hello world';
      const serialized = serializeValue(value);
      expect(serialized).toEqual({ type: 'string', value: 'hello world' });
      expect(deserializeValue(serialized)).toBe('hello world');
    });

    test('serialize/deserialize boolean true', () => {
      const value = true;
      const serialized = serializeValue(value);
      expect(serialized).toEqual({ type: 'bool', value: true });
      expect(deserializeValue(serialized)).toBe(true);
    });

    test('serialize/deserialize boolean false', () => {
      const value = false;
      const serialized = serializeValue(value);
      expect(serialized).toEqual({ type: 'bool', value: false });
      expect(deserializeValue(serialized)).toBe(false);
    });
  });

  describe('Array type', () => {
    test('serialize/deserialize empty array', () => {
      const value: any[] = [];
      const serialized = serializeValue(value);
      expect(serialized).toEqual({ type: 'array', value: [] });
      expect(deserializeValue(serialized)).toEqual([]);
    });

    test('serialize/deserialize array of integers', () => {
      const value = [1, 2, 3];
      const serialized = serializeValue(value);
      expect(serialized).toEqual({
        type: 'array',
        value: [
          { type: 'int', value: 1 },
          { type: 'int', value: 2 },
          { type: 'int', value: 3 },
        ],
      });
      expect(deserializeValue(serialized)).toEqual([1, 2, 3]);
    });

    test('serialize/deserialize array of mixed types', () => {
      const value = [1, 'hello', true, null];
      const serialized = serializeValue(value);
      const deserialized = deserializeValue(serialized);
      expect(deserialized).toEqual([1, 'hello', true, null]);
    });

    test('serialize/deserialize nested arrays', () => {
      const value = [[1, 2], [3, 4]];
      const serialized = serializeValue(value);
      const deserialized = deserializeValue(serialized);
      expect(deserialized).toEqual([[1, 2], [3, 4]]);
    });
  });

  describe('Record/Object type', () => {
    test('serialize/deserialize empty record', () => {
      const value = {};
      const serialized = serializeValue(value);
      expect(serialized).toEqual({ type: 'record', value: {} });
      expect(deserializeValue(serialized)).toEqual({});
    });

    test('serialize/deserialize simple record', () => {
      const value = { name: 'Alice', age: 30 };
      const serialized = serializeValue(value);
      expect(serialized).toEqual({
        type: 'record',
        value: {
          name: { type: 'string', value: 'Alice' },
          age: { type: 'int', value: 30 },
        },
      });
      expect(deserializeValue(serialized)).toEqual({ name: 'Alice', age: 30 });
    });

    test('serialize/deserialize nested records', () => {
      const value = {
        user: {
          name: 'Bob',
          contact: {
            email: 'bob@example.com',
          },
        },
      };
      const serialized = serializeValue(value);
      const deserialized = deserializeValue(serialized);
      expect(deserialized).toEqual(value);
    });
  });

  describe('Temporal types', () => {
    test('serialize/deserialize Temporal.Instant', () => {
      const value = Temporal.Instant.from('2025-01-15T10:30:00Z');
      const serialized = serializeValue(value);
      expect(serialized.type).toBe('instant');
      expect(serialized.value).toBe('2025-01-15T10:30:00Z');

      const deserialized = deserializeValue(serialized);
      expect(deserialized).toBeInstanceOf(Temporal.Instant);
      expect(deserialized.toString()).toBe('2025-01-15T10:30:00Z');
    });

    test('serialize/deserialize Temporal.PlainDate', () => {
      const value = Temporal.PlainDate.from('2025-01-15');
      const serialized = serializeValue(value);
      expect(serialized.type).toBe('plain_date');
      expect(serialized.value).toBe('2025-01-15');

      const deserialized = deserializeValue(serialized);
      expect(deserialized).toBeInstanceOf(Temporal.PlainDate);
      expect(deserialized.toString()).toBe('2025-01-15');
    });

    test('serialize/deserialize Temporal.ZonedDateTime', () => {
      const value = Temporal.ZonedDateTime.from('2025-01-15T10:30:00-05:00[America/New_York]');
      const serialized = serializeValue(value);
      expect(serialized.type).toBe('zoned_datetime');

      const deserialized = deserializeValue(serialized);
      expect(deserialized).toBeInstanceOf(Temporal.ZonedDateTime);
      expect(deserialized.timeZoneId).toBe('America/New_York');
    });
  });

  describe('Stack serialization', () => {
    test('serializeStack with multiple values', () => {
      const stack = [1, 'hello', true, null];
      const serialized = serializeStack(stack);
      expect(serialized).toHaveLength(4);
      expect(serialized[0]).toEqual({ type: 'int', value: 1 });
      expect(serialized[1]).toEqual({ type: 'string', value: 'hello' });
      expect(serialized[2]).toEqual({ type: 'bool', value: true });
      expect(serialized[3]).toEqual({ type: 'null', value: null });
    });

    test('deserializeStack with multiple values', () => {
      const stackValues: StackValue[] = [
        { type: 'int', value: 1 },
        { type: 'string', value: 'hello' },
        { type: 'bool', value: true },
        { type: 'null', value: null },
      ];
      const deserialized = deserializeStack(stackValues);
      expect(deserialized).toEqual([1, 'hello', true, null]);
    });

    test('round-trip stack serialization', () => {
      const originalStack = [
        42,
        3.14,
        'test',
        true,
        null,
        [1, 2, 3],
        { name: 'Alice', age: 30 },
      ];
      const serialized = serializeStack(originalStack);
      const deserialized = deserializeStack(serialized);
      expect(deserialized).toEqual(originalStack);
    });
  });

  describe('Error handling', () => {
    test('deserialize unknown type throws error', () => {
      const invalidValue = { type: 'unknown_type', value: 'test' } as any;
      expect(() => deserializeValue(invalidValue)).toThrow('Unknown stack value type');
    });
  });
});
