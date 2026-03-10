import { StandardInterpreter } from "../../../interpreter";
import { LiteralHandler } from "../../../literals";

describe("Literal Handlers", () => {
  let interp: StandardInterpreter;

  beforeEach(() => {
    interp = new StandardInterpreter([], "America/Los_Angeles");
  });

  test("Boolean literals", async () => {
    await interp.run("TRUE FALSE");
    expect(interp.stack_pop()).toBe(false);
    expect(interp.stack_pop()).toBe(true);
  });

  test("Integer literals", async () => {
    await interp.run("42 -10 0");
    expect(interp.stack_pop()).toBe(0);
    expect(interp.stack_pop()).toBe(-10);
    expect(interp.stack_pop()).toBe(42);
  });

  test("Float literals", async () => {
    await interp.run("3.14 -2.5");
    expect(interp.stack_pop()).toBe(-2.5);
    expect(interp.stack_pop()).toBe(3.14);
  });

  test("Date literals", async () => {
    await interp.run("2020-06-05");
    const date = interp.stack_pop();
    expect(date).toEqual(Temporal.PlainDate.from({ year: 2020, month: 6, day: 5 }));
  });

  test("Date literals with wildcards", async () => {
    await interp.run("YYYY-MM-DD");
    const date = interp.stack_pop();
    const today = Temporal.Now.plainDateISO("America/Los_Angeles");
    expect(date.year).toBe(today.year);
    expect(date.month).toBe(today.month);
    expect(date.day).toBe(today.day);
  });

  test("Time literals", async () => {
    await interp.run("9:00 11:30");
    expect(interp.stack_pop()).toEqual(Temporal.PlainTime.from({ hour: 11, minute: 30 }));
    expect(interp.stack_pop()).toEqual(Temporal.PlainTime.from({ hour: 9, minute: 0 }));
  });

  test("Time literals with AM/PM", async () => {
    await interp.run("9:00 AM 11:30 PM");
    expect(interp.stack_pop()).toEqual(Temporal.PlainTime.from({ hour: 23, minute: 30 }));
    expect(interp.stack_pop()).toEqual(Temporal.PlainTime.from({ hour: 9, minute: 0 }));
  });

  test("Zoned datetime literals", async () => {
    await interp.run("2020-07-01T15:20:00Z");
    const datetime = interp.stack_pop();
    expect(datetime).toBeInstanceOf(Temporal.ZonedDateTime);
    expect(datetime.year).toBe(2020);
    expect(datetime.month).toBe(7);
    expect(datetime.day).toBe(1);
    expect(datetime.hour).toBe(15);
    expect(datetime.minute).toBe(20);
  });

  test("Zoned datetime with IANA timezone in bracket notation", async () => {
    await interp.run("2025-05-20T08:00:00[America/Los_Angeles]");
    const datetime = interp.stack_pop();
    expect(datetime).toBeInstanceOf(Temporal.ZonedDateTime);
    expect(datetime.timeZoneId).toBe("America/Los_Angeles");
    expect(datetime.year).toBe(2025);
    expect(datetime.month).toBe(5);
    expect(datetime.day).toBe(20);
    expect(datetime.hour).toBe(8);
    expect(datetime.minute).toBe(0);
  });

  test("Zoned datetime with offset and IANA timezone", async () => {
    await interp.run("2025-05-20T08:00:00-07:00[America/Los_Angeles]");
    const datetime = interp.stack_pop();
    expect(datetime).toBeInstanceOf(Temporal.ZonedDateTime);
    expect(datetime.timeZoneId).toBe("America/Los_Angeles");
    expect(datetime.hour).toBe(8); // Wall clock time preserved
  });

  test("Zoned datetime with different IANA timezone", async () => {
    await interp.run("2025-05-20T10:30:00[Europe/London]");
    const datetime = interp.stack_pop();
    expect(datetime).toBeInstanceOf(Temporal.ZonedDateTime);
    expect(datetime.timeZoneId).toBe("Europe/London");
    expect(datetime.hour).toBe(10);
    expect(datetime.minute).toBe(30);
  });

  test("Custom literal handler", async () => {
    // Currency literal: "$42.50" → 42.5
    const to_currency: LiteralHandler = (str: string) => {
      const match = str.match(/^\$(\d+(?:\.\d{2})?)$/);
      if (!match) return null;
      return parseFloat(match[1]);
    };

    interp.register_literal_handler(to_currency);

    await interp.run("$42.50");
    expect(interp.stack_pop()).toBe(42.5);
  });



  test("Handler priority - last registered wins (can override)", async () => {
    const handler1: LiteralHandler = (str) => str === "TEST" ? "FIRST" : null;
    const handler2: LiteralHandler = (str) => str === "TEST" ? "SECOND" : null;

    interp.register_literal_handler(handler1);
    interp.register_literal_handler(handler2);

    // handler2 was registered last, so it's checked first and wins
    await interp.run("TEST");
    expect(interp.stack_pop()).toBe("SECOND");
  });

  test("Standard handler priority - float before int", async () => {
    // 3.14 should be parsed as float, not fail trying as int
    await interp.run("3.14");
    expect(interp.stack_pop()).toBe(3.14);
  });

  test("Literals don't shadow words", async () => {
    // Define a word called "42"
    await interp.run(": 42   100 ;");
    await interp.run("42");
    // Word should be found first, not literal
    expect(interp.stack_pop()).toBe(100);
  });


  test("Custom UUID literal", async () => {
    const to_uuid: LiteralHandler = (str: string) => {
      const regex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      return regex.test(str) ? str.toUpperCase() : null;
    };

    interp.register_literal_handler(to_uuid);

    await interp.run("550e8400-e29b-41d4-a716-446655440000");
    expect(interp.stack_pop()).toBe("550E8400-E29B-41D4-A716-446655440000");
  });
});
