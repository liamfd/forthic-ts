import { to_zoned_datetime } from "../../../utils";

test("to_zoned_datetime", () => {
  const date = to_zoned_datetime("2025-06-07T13:00:00", "America/Los_Angeles");
  expect(date).toBeInstanceOf(Temporal.ZonedDateTime);
  expect(date?.year).toBe(2025);
  expect(date?.month).toBe(6);
  expect(date?.day).toBe(7);
  expect(date?.hour).toBe(13);
  expect(date?.minute).toBe(0);
  expect(date?.second).toBe(0);
});

