
export function to_zoned_datetime(dateString: string, timezone: string): Temporal.ZonedDateTime | null {
  try {
    // Parse the date string and create a ZonedDateTime in the specified timezone
    return Temporal.ZonedDateTime.from({
      timeZone: timezone,
      year: parseInt(dateString.substring(0, 4)),
      month: parseInt(dateString.substring(5, 7)),
      day: parseInt(dateString.substring(8, 10)),
      hour: parseInt(dateString.substring(11, 13)),
      minute: parseInt(dateString.substring(14, 16)),
      second: parseInt(dateString.substring(17, 19)),
    });
  } catch (e) {
    return null;
  }
}
