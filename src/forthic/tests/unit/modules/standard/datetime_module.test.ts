import { StandardInterpreter } from "../../../../interpreter";

let interp: StandardInterpreter;

beforeEach(async () => {
  interp = new StandardInterpreter([], "America/Los_Angeles");
});

// ========================================
// Current Time/Date
// ========================================

test("TODAY returns current date", async () => {
  await interp.run("TODAY");
  const result = interp.stack_pop();
  const today = Temporal.Now.plainDateISO(interp.get_timezone());

  expect(result.year).toBe(today.year);
  expect(result.month).toBe(today.month);
  expect(result.day).toBe(today.day);
});

test("NOW returns current datetime", async () => {
  await interp.run("NOW");
  const result = interp.stack_pop();
  const now = Temporal.Now.plainDateTimeISO(interp.get_timezone());

  expect(result.year).toBe(now.year);
  expect(result.month).toBe(now.month);
  expect(result.day).toBe(now.day);
  expect(result.hour).toBe(now.hour);
  expect(result.minute).toBe(now.minute);
});

// ========================================
// Time Adjustment (AM/PM)
// ========================================

test("AM converts afternoon to morning", async () => {
  await interp.run("14:30 AM");
  const result = interp.stack_pop();
  expect(result.hour).toBe(2);
  expect(result.minute).toBe(30);
});

test("AM keeps morning times unchanged", async () => {
  await interp.run("'09:15' >TIME AM");
  const result = interp.stack_pop();
  expect(result.hour).toBe(9);
  expect(result.minute).toBe(15);
});

test("PM converts morning to afternoon", async () => {
  await interp.run("09:15 PM");
  const result = interp.stack_pop();
  expect(result.hour).toBe(21);
  expect(result.minute).toBe(15);
});

test("PM keeps afternoon times unchanged", async () => {
  await interp.run("14:30 PM");
  const result = interp.stack_pop();
  expect(result.hour).toBe(14);
  expect(result.minute).toBe(30);
});

test("AM/PM with noon and midnight", async () => {
  await interp.run("'12:00' >TIME AM");
  expect(interp.stack_pop().hour).toBe(0);

  await interp.run("'00:00' >TIME PM");
  expect(interp.stack_pop().hour).toBe(12);
});

// ========================================
// Conversion TO Time/Date/DateTime
// ========================================

test(">TIME parses HH:MM format", async () => {
  await interp.run("'14:30' >TIME");
  const result = interp.stack_pop();
  expect(result.hour).toBe(14);
  expect(result.minute).toBe(30);
});

test(">TIME parses HH:MM AM format", async () => {
  await interp.run("'10:52 PM' >TIME");
  const result = interp.stack_pop();
  expect(result.hour).toBe(22);
  expect(result.minute).toBe(52);
});

test(">TIME parses HH:MM PM format", async () => {
  await interp.run("'02:15 PM' >TIME");
  const result = interp.stack_pop();
  expect(result.hour).toBe(14);
  expect(result.minute).toBe(15);
});

test(">TIME extracts time from datetime", async () => {
  await interp.run("NOW >TIME");
  const result = interp.stack_pop();
  expect(typeof result.hour).toBe("number");
  expect(typeof result.minute).toBe("number");
});

test(">DATE parses ISO format", async () => {
  await interp.run("'2024-01-15' >DATE");
  const result = interp.stack_pop();
  expect(result.year).toBe(2024);
  expect(result.month).toBe(1);
  expect(result.day).toBe(15);
});

test(">DATE parses flexible format", async () => {
  await interp.run("'Oct 21, 2020' >DATE");
  const result = interp.stack_pop();
  expect(result.year).toBe(2020);
  expect(result.month).toBe(10);
  expect(result.day).toBe(21);
});

test(">DATE extracts date from datetime", async () => {
  await interp.run("NOW >DATE");
  const result = interp.stack_pop();
  const today = Temporal.Now.plainDateISO(interp.get_timezone());
  expect(result.year).toBe(today.year);
  expect(result.month).toBe(today.month);
  expect(result.day).toBe(today.day);
});

test(">DATETIME parses ISO datetime string", async () => {
  await interp.run("'2024-01-15T14:30:00' >DATETIME");
  const result = interp.stack_pop();
  expect(result.year).toBe(2024);
  expect(result.month).toBe(1);
  expect(result.day).toBe(15);
  expect(result.hour).toBe(14);
  expect(result.minute).toBe(30);
});

test(">DATETIME converts Unix timestamp", async () => {
  // 1593895532 seconds = July 4, 2020, 13:45:32 PDT
  await interp.run("1593895532 >DATETIME");
  const result = interp.stack_pop();
  expect(result.year).toBe(2020);
  expect(result.month).toBe(7);
  expect(result.day).toBe(4);
});

test("AT combines date and time", async () => {
  await interp.run("'2024-01-15' >DATE '14:30' >TIME AT");
  const result = interp.stack_pop();
  expect(result.year).toBe(2024);
  expect(result.month).toBe(1);
  expect(result.day).toBe(15);
  expect(result.hour).toBe(14);
  expect(result.minute).toBe(30);
});

// ========================================
// Conversion FROM Time/Date
// ========================================

test("TIME>STR formats time as HH:MM", async () => {
  await interp.run("'14:30' >TIME TIME>STR");
  expect(interp.stack_pop()).toBe("14:30");
});

test("DATE>STR formats date as YYYY-MM-DD", async () => {
  await interp.run("'2024-01-15' >DATE DATE>STR");
  expect(interp.stack_pop()).toBe("2024-01-15");
});

test("DATE>STR with literal date", async () => {
  await interp.run("2021-01-01 DATE>STR");
  expect(interp.stack_pop()).toBe("2021-01-01");
});

test("DATE>INT converts date to integer", async () => {
  await interp.run("'2024-01-15' >DATE DATE>INT");
  expect(interp.stack_pop()).toBe(20240115);
});

test("DATE>INT with single-digit month and day", async () => {
  await interp.run("'2024-03-05' >DATE DATE>INT");
  expect(interp.stack_pop()).toBe(20240305);
});

// ========================================
// Timestamp Operations
// ========================================

test(">TIMESTAMP converts datetime to Unix timestamp", async () => {
  await interp.run("'2020-07-01T15:20:00' >DATETIME >TIMESTAMP");
  const result = interp.stack_pop();
  // Should be close to 1593642000 (may vary slightly due to timezone)
  expect(result).toBeCloseTo(1593642000, -2);
});

test("TIMESTAMP>DATETIME converts Unix timestamp to datetime", async () => {
  await interp.run("1593895532 TIMESTAMP>DATETIME");
  const result = interp.stack_pop();
  expect(result.year).toBe(2020);
  expect(result.month).toBe(7);
  expect(result.day).toBe(4);
  expect(result.hour).toBe(13);
  expect(result.minute).toBe(45);
});

test("Round-trip: datetime -> timestamp -> datetime", async () => {
  await interp.run("'2024-01-15T14:30:00' >DATETIME >TIMESTAMP TIMESTAMP>DATETIME");
  const result = interp.stack_pop();
  expect(result.year).toBe(2024);
  expect(result.month).toBe(1);
  expect(result.day).toBe(15);
  expect(result.hour).toBe(14);
  expect(result.minute).toBe(30);
});

// ========================================
// Date Math
// ========================================

test("ADD-DAYS adds positive days", async () => {
  await interp.run("'2024-01-15' >DATE 10 ADD-DAYS");
  const result = interp.stack_pop();
  expect(result.year).toBe(2024);
  expect(result.month).toBe(1);
  expect(result.day).toBe(25);
});

test("ADD-DAYS adds negative days", async () => {
  await interp.run("'2024-01-15' >DATE -5 ADD-DAYS");
  const result = interp.stack_pop();
  expect(result.year).toBe(2024);
  expect(result.month).toBe(1);
  expect(result.day).toBe(10);
});

test("ADD-DAYS crosses month boundary", async () => {
  await interp.run("'2020-10-21' >DATE 12 ADD-DAYS");
  const result = interp.stack_pop();
  expect(result.year).toBe(2020);
  expect(result.month).toBe(11);
  expect(result.day).toBe(2);
});

test("ADD-DAYS with literal date", async () => {
  await interp.run("2020-10-21 12 ADD-DAYS");
  const result = interp.stack_pop();
  expect(result.year).toBe(2020);
  expect(result.month).toBe(11);
  expect(result.day).toBe(2);
});

test("SUBTRACT-DATES calculates positive difference", async () => {
  // date1 - date2 = 2024-01-15 - 2024-01-25 = -10
  await interp.run("'2024-01-15' >DATE '2024-01-25' >DATE SUBTRACT-DATES");
  expect(interp.stack_pop()).toBe(-10);
});

test("SUBTRACT-DATES calculates negative difference", async () => {
  await interp.run("'2020-10-21' >DATE '2020-11-02' >DATE SUBTRACT-DATES");
  expect(interp.stack_pop()).toBe(-12);
});

test("SUBTRACT-DATES with literal dates", async () => {
  await interp.run("2020-10-21 2020-11-02 SUBTRACT-DATES");
  expect(interp.stack_pop()).toBe(-12);
});

test("SUBTRACT-DATES with same date", async () => {
  await interp.run("'2024-01-15' >DATE '2024-01-15' >DATE SUBTRACT-DATES");
  expect(interp.stack_pop()).toBe(0);
});

// ========================================
// Edge Cases
// ========================================

test(">TIME with null returns null", async () => {
  await interp.run("NULL >TIME");
  expect(interp.stack_pop()).toBeNull();
});

test(">DATE with null returns null", async () => {
  await interp.run("NULL >DATE");
  expect(interp.stack_pop()).toBeNull();
});

test("AM with null returns null", async () => {
  await interp.run("NULL AM");
  expect(interp.stack_pop()).toBeNull();
});

test("PM with null returns null", async () => {
  await interp.run("NULL PM");
  expect(interp.stack_pop()).toBeNull();
});

test("ADD-DAYS with null date returns null", async () => {
  await interp.run("NULL 5 ADD-DAYS");
  expect(interp.stack_pop()).toBeNull();
});

test("SUBTRACT-DATES with null dates returns null", async () => {
  await interp.run("NULL '2024-01-15' >DATE SUBTRACT-DATES");
  expect(interp.stack_pop()).toBeNull();
});

// ========================================
// Integration Tests
// ========================================

test("Complex datetime workflow", async () => {
  await interp.run(`
    '2024-01-15' >DATE
    '14:30' >TIME
    AT
    >TIMESTAMP
    TIMESTAMP>DATETIME
    >DATE
    DATE>STR
  `);
  expect(interp.stack_pop()).toBe("2024-01-15");
});

test("Date arithmetic chain", async () => {
  await interp.run(`
    TODAY
    7 ADD-DAYS
    14 ADD-DAYS
    TODAY
    SUBTRACT-DATES
  `);
  expect(interp.stack_pop()).toBe(21);
});
