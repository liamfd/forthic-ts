import { Interpreter } from "../../interpreter.js";
import { DecoratedModule, ForthicWord, ForthicDirectWord, registerModuleDoc } from "../../decorators/word.js";

export class DateTimeModule extends DecoratedModule {
  static {
    registerModuleDoc(DateTimeModule, `
Date and time operations using the Temporal API for timezone-aware datetime manipulation.

## Categories
- Current: TODAY, NOW
- Time adjustment: AM, PM
- Conversion to: >TIME, >DATE, >DATETIME, AT
- Conversion from: TIME>STR, DATE>STR, DATE>INT
- Timestamps: >TIMESTAMP, TIMESTAMP>DATETIME
- Date math: ADD-DAYS, SUBTRACT-DATES

## Examples
TODAY
NOW
"14:30" >TIME
"2024-01-15" >DATE
TODAY "14:30" >TIME AT
TODAY 7 ADD-DAYS
`);
  }

  constructor() {
    super("datetime");
  }


  @ForthicDirectWord("( -- date:Temporal.PlainDate )", "Get current date", "TODAY")
  async TODAY(interp: Interpreter) {
    const today = Temporal.Now.plainDateISO(interp.get_timezone());
    interp.stack_push(today);
  }

  @ForthicDirectWord("( -- datetime:Temporal.ZonedDateTime )", "Get current datetime", "NOW")
  async NOW(interp: Interpreter) {
    const now = Temporal.Now.plainDateTimeISO(interp.get_timezone());
    interp.stack_push(now);
  }


  @ForthicWord("( time:Temporal.PlainTime -- time:Temporal.PlainTime )", "Convert time to AM (subtract 12 from hour if >= 12)")
  async AM(time: any) {
    if (!time || typeof time.hour !== "number") {
      return time;
    }
    if (time.hour >= 12) {
      return time.with({ hour: time.hour - 12 });
    }
    return time;
  }

  @ForthicWord("( time:Temporal.PlainTime -- time:Temporal.PlainTime )", "Convert time to PM (add 12 to hour if < 12)")
  async PM(time: any) {
    if (!time || typeof time.hour !== "number") {
      return time;
    }
    if (time.hour < 12) {
      return time.with({ hour: time.hour + 12 });
    }
    return time;
  }


  @ForthicWord("( item:any -- time:Temporal.PlainTime )", "Convert string or datetime to PlainTime", ">TIME")
  async to_TIME(item: any) {
    if (!item) {
      return null;
    }

    // If already a PlainTime, return it
    if (item instanceof Temporal.PlainTime) {
      return item;
    }

    // If it's a PlainDateTime, extract the time
    if (item instanceof Temporal.PlainDateTime || item instanceof Temporal.ZonedDateTime) {
      return item.toPlainTime();
    }

    // Otherwise, parse as string
    const str = String(item).trim();

    // Handle "HH:MM AM/PM" format
    const ampmMatch = str.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
    if (ampmMatch) {
      let hour = parseInt(ampmMatch[1], 10);
      const minute = parseInt(ampmMatch[2], 10);
      const meridiem = ampmMatch[3].toUpperCase();

      if (meridiem === "PM" && hour < 12) {
        hour += 12;
      } else if (meridiem === "AM" && hour === 12) {
        hour = 0;
      }

      return Temporal.PlainTime.from({ hour, minute });
    }

    // Try standard Temporal parsing (HH:MM or HH:MM:SS)
    try {
      return Temporal.PlainTime.from(str);
    } catch {
      return null;
    }
  }

  @ForthicWord("( item:any -- date:Temporal.PlainDate )", "Convert string or datetime to PlainDate", ">DATE")
  async to_DATE(item: any) {
    if (!item) {
      return null;
    }

    // If already a PlainDate, return it
    if (item instanceof Temporal.PlainDate) {
      return item;
    }

    // If it's a PlainDateTime or ZonedDateTime, extract the date
    if (item instanceof Temporal.PlainDateTime || item instanceof Temporal.ZonedDateTime) {
      return item.toPlainDate();
    }

    // Otherwise, parse as string
    const str = String(item).trim();

    // Try standard ISO format (YYYY-MM-DD)
    try {
      return Temporal.PlainDate.from(str);
    } catch {
      // Try parsing as a more flexible format
      try {
        const parsed = new Date(str);
        if (!isNaN(parsed.getTime())) {
          return Temporal.PlainDate.from({
            year: parsed.getFullYear(),
            month: parsed.getMonth() + 1,
            day: parsed.getDate(),
          });
        }
      } catch {
        // Fall through
      }
    }

    return null;
  }

  @ForthicDirectWord("( str_or_timestamp:any -- datetime:Temporal.ZonedDateTime )", "Convert string or timestamp to ZonedDateTime", ">DATETIME")
  async to_DATETIME(interp: Interpreter) {
    const item = interp.stack_pop();

    if (!item) {
      interp.stack_push(null);
      return;
    }

    // If already a ZonedDateTime, return it
    if (item instanceof Temporal.ZonedDateTime) {
      interp.stack_push(item);
      return;
    }

    // If it's a number, treat as Unix timestamp (seconds)
    if (typeof item === "number") {
      const instant = Temporal.Instant.fromEpochMilliseconds(item * 1000);
      const zoned = instant.toZonedDateTimeISO(interp.get_timezone());
      interp.stack_push(zoned);
      return;
    }

    // If it's a PlainDateTime, convert to ZonedDateTime
    if (item instanceof Temporal.PlainDateTime) {
      const zoned = item.toZonedDateTime(interp.get_timezone());
      interp.stack_push(zoned);
      return;
    }

    // Otherwise, parse as string
    const str = String(item).trim();

    try {
      // Try parsing as ISO datetime string
      const plainDateTime = Temporal.PlainDateTime.from(str);
      const zoned = plainDateTime.toZonedDateTime(interp.get_timezone());
      interp.stack_push(zoned);
    } catch {
      interp.stack_push(null);
    }
  }

  @ForthicDirectWord("( date:Temporal.PlainDate time:Temporal.PlainTime -- datetime:Temporal.ZonedDateTime )", "Combine date and time into datetime", "AT")
  async AT(interp: Interpreter) {
    const time = interp.stack_pop();
    const date = interp.stack_pop();

    if (!date || !time) {
      interp.stack_push(null);
      return;
    }

    // Create PlainDateTime from date and time components
    const datetime = Temporal.PlainDateTime.from({
      year: date.year,
      month: date.month,
      day: date.day,
      hour: time.hour || 0,
      minute: time.minute || 0,
      second: time.second || 0,
      millisecond: time.millisecond || 0,
    });

    // Convert to ZonedDateTime using interpreter's timezone
    const zoned = datetime.toZonedDateTime(interp.get_timezone());
    interp.stack_push(zoned);
  }


  @ForthicWord("( time:Temporal.PlainTime -- str:string )", "Convert time to HH:MM string", "TIME>STR")
  async TIME_to_STR(time: any) {
    if (!time || typeof time.hour !== "number") {
      return "";
    }

    const hour = String(time.hour).padStart(2, "0");
    const minute = String(time.minute).padStart(2, "0");
    return `${hour}:${minute}`;
  }

  @ForthicWord("( date:Temporal.PlainDate -- str:string )", "Convert date to YYYY-MM-DD string", "DATE>STR")
  async DATE_to_STR(date: any) {
    if (!date || typeof date.year !== "number") {
      return "";
    }

    return date.toString();
  }

  @ForthicWord("( date:Temporal.PlainDate -- int:number )", "Convert date to integer (YYYYMMDD)", "DATE>INT")
  async DATE_to_INT(date: any) {
    if (!date || typeof date.year !== "number") {
      return null;
    }

    const year = date.year;
    const month = String(date.month).padStart(2, "0");
    const day = String(date.day).padStart(2, "0");
    return parseInt(`${year}${month}${day}`, 10);
  }


  @ForthicDirectWord("( datetime:Temporal.ZonedDateTime -- timestamp:number )", "Convert datetime to Unix timestamp (seconds)", ">TIMESTAMP")
  async to_TIMESTAMP(interp: Interpreter) {
    const datetime = interp.stack_pop();

    if (!datetime) {
      interp.stack_push(null);
      return;
    }

    let instant: Temporal.Instant;

    // Convert to Instant
    if (datetime instanceof Temporal.ZonedDateTime) {
      instant = datetime.toInstant();
    } else if (datetime instanceof Temporal.PlainDateTime) {
      // Convert PlainDateTime to ZonedDateTime first using interpreter timezone
      const zoned = datetime.toZonedDateTime(interp.get_timezone());
      instant = zoned.toInstant();
    } else if (datetime instanceof Temporal.Instant) {
      instant = datetime;
    } else {
      interp.stack_push(null);
      return;
    }

    // Convert to milliseconds (JavaScript convention)
    const timestamp = instant.epochMilliseconds;
    interp.stack_push(Math.floor(timestamp / 1000)); // Return seconds for compatibility
  }

  @ForthicDirectWord("( timestamp:number -- datetime:Temporal.ZonedDateTime )", "Convert Unix timestamp (seconds) to datetime", "TIMESTAMP>DATETIME")
  async TIMESTAMP_to_DATETIME(interp: Interpreter) {
    const timestamp = interp.stack_pop();

    if (timestamp === null || timestamp === undefined || typeof timestamp !== "number") {
      interp.stack_push(null);
      return;
    }

    // Assume timestamp is in seconds, convert to milliseconds
    const instant = Temporal.Instant.fromEpochMilliseconds(timestamp * 1000);
    const zoned = instant.toZonedDateTimeISO(interp.get_timezone());
    interp.stack_push(zoned);
  }


  // ( date num_days -- date )
  @ForthicWord("( date:Temporal.PlainDate num_days:number -- date:Temporal.PlainDate )", "Add days to a date", "ADD-DAYS")
  async ADD_DAYS(date: any, num_days: number) {
    if (!date || typeof date.year !== "number" || num_days === null || num_days === undefined) {
      return null;
    }

    return date.add({ days: num_days });
  }

  // ( date1 date2 -- num_days )
  @ForthicWord("( date1:Temporal.PlainDate date2:Temporal.PlainDate -- num_days:number )", "Get difference in days between dates (date1 - date2)", "SUBTRACT-DATES")
  async SUBTRACT_DATES(date1: any, date2: any) {
    if (!date1 || !date2 || typeof date1.year !== "number" || typeof date2.year !== "number") {
      return null;
    }

    // Get the difference: date1 - date2
    // until() gives us date1 → date2, but we want date2 → date1 (negative of until)
    const duration = date2.until(date1, { largestUnit: "days" });
    return duration.days;
  }
}
