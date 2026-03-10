/**
 * Literal Handlers for Forthic Interpreters
 *
 * This module provides literal parsing functions that convert string tokens into typed values.
 * These handlers are used by the Forthic interpreter to recognize and parse different literal types.
 *
 * You can use these built-in handlers or create custom literal handlers for your own Forthic
 * interpreters. Each handler should implement the LiteralHandler type: a function that takes
 * a string and returns the parsed value or null if the string doesn't match the expected format.
 *
 * Built-in literal types:
 * - Boolean: TRUE, FALSE
 * - Integer: 42, -10, 0
 * - Float: 3.14, -2.5, 0.0
 * - Time: 9:00, 11:30 PM, 22:15
 * - Date: 2020-06-05, YYYY-MM-DD (with wildcards)
 * - ZonedDateTime: ISO 8601 timestamps with timezone support
 */

/**
 * Literal handler: takes string, returns parsed value or null if can't parse
 */
export type LiteralHandler = (value: string) => any | null;

/**
 * Parse boolean literals: TRUE, FALSE
 */
export function to_bool(str: string): boolean | null {
  if (str === "TRUE") return true;
  if (str === "FALSE") return false;
  return null;
}

/**
 * Parse float literals: 3.14, -2.5, 0.0
 * Must contain a decimal point
 */
export function to_float(str: string): number | null {
  if (str.indexOf(".") === -1) return null;
  const result = parseFloat(str);
  if (isNaN(result)) return null;
  return result;
}

/**
 * Parse integer literals: 42, -10, 0
 * Must not contain a decimal point
 */
export function to_int(str: string): number | null {
  if (str.indexOf(".") !== -1) return null;
  const result = parseInt(str, 10);
  if (isNaN(result)) return null;
  // Verify it's actually an integer string (not "42abc")
  if (result.toString() !== str) return null;
  return result;
}

/**
 * Parse time literals: 9:00, 11:30 PM, 22:15 AM
 */
export function to_time(str: string): Temporal.PlainTime | null {
  const match = str.match(/^(\d{1,2}):(\d{2})(?:\s*(AM|PM))?$/);
  if (!match) return null;

  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  const meridiem = match[3];

  // Adjust for AM/PM
  if (meridiem === "PM" && hours < 12) {
    hours += 12;
  } else if (meridiem === "AM" && hours === 12) {
    hours = 0;
  } else if (meridiem === "AM" && hours > 12) {
    // Handle invalid cases like "22:15 AM"
    hours -= 12;
  }

  if (hours > 23 || minutes >= 60) return null;

  return Temporal.PlainTime.from({ hour: hours, minute: minutes });
}

/**
 * Create a date literal handler with timezone support
 * Parses: 2020-06-05, YYYY-MM-DD (with wildcards)
 */
export function to_literal_date(
  timezone: Temporal.TimeZoneLike
): LiteralHandler {
  return (str: string): Temporal.PlainDate | null => {
    const match = str.match(/^(\d{4}|YYYY)-(\d{2}|MM)-(\d{2}|DD)$/);
    if (!match) return null;

    const now = Temporal.Now.zonedDateTimeISO(timezone);
    const year = match[1] === "YYYY" ? now.year : Number(match[1]);
    const month = match[2] === "MM" ? now.month : Number(match[2]);
    const day = match[3] === "DD" ? now.day : Number(match[3]);

    try {
      return Temporal.PlainDate.from({ year, month, day });
    } catch {
      return null;
    }
  };
}

/**
 * Create a zoned datetime literal handler with timezone support
 * Parses:
 * - 2025-05-24T10:15:00[America/Los_Angeles] (IANA named timezone, RFC 9557)
 * - 2025-05-24T10:15:00-07:00[America/Los_Angeles] (offset + IANA timezone)
 * - 2025-05-24T10:15:00Z (UTC)
 * - 2025-05-24T10:15:00-05:00 (offset timezone)
 * - 2025-05-24T10:15:00 (uses interpreter's timezone)
 */
export function to_zoned_datetime(
  timezone: Temporal.TimeZoneLike
): LiteralHandler {
  return (str: string): Temporal.ZonedDateTime | null => {
    if (!str.includes("T")) return null;

    try {
      // Handle IANA named timezone in bracket notation (RFC 9557)
      // Examples: 2025-05-20T08:00:00[America/Los_Angeles]
      //           2025-05-20T08:00:00-07:00[America/Los_Angeles]
      if (str.includes("[") && str.endsWith("]")) {
        return Temporal.ZonedDateTime.from(str);
      }

      // Handle explicit UTC (Z suffix)
      if (str.endsWith("Z")) {
        return Temporal.Instant.from(str).toZonedDateTimeISO("UTC");
      }

      // Handle explicit timezone offset (+05:00, -05:00)
      const offsetMatch = str.match(/[+-]\d{2}:\d{2}$/);
      if (offsetMatch) {
        const instant = Temporal.Instant.from(str);
        // Convert to UTC for canonical storage
        return instant.toZonedDateTimeISO("UTC");
      }

      // No timezone specified, use interpreter's timezone
      const dt = Temporal.PlainDateTime.from(str);
      return dt.toZonedDateTime(timezone);
    } catch {
      return null;
    }
  };
}
