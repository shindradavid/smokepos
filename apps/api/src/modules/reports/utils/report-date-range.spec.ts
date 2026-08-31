import { BadRequestException } from '@nestjs/common';
import { formatReportCalendarDate, parseReportDateRange } from './report-date-range';

describe('parseReportDateRange', () => {
  it('creates local start-of-day and end-of-day boundaries', () => {
    const range = parseReportDateRange('2026-08-01', '2026-08-31');

    expect(range.startDateTime.getFullYear()).toBe(2026);
    expect(range.startDateTime.getMonth()).toBe(7);
    expect(range.startDateTime.getDate()).toBe(1);
    expect(range.startDateTime.getHours()).toBe(0);
    expect(range.endDateTime.getDate()).toBe(31);
    expect(range.endDateTime.getHours()).toBe(23);
    expect(range.endDateTime.getMilliseconds()).toBe(999);
  });

  it('rejects reversed ranges', () => {
    expect(() => parseReportDateRange('2026-08-31', '2026-08-01')).toThrow(BadRequestException);
  });

  it('rejects invalid calendar dates and timestamp-shaped values', () => {
    expect(() => parseReportDateRange('2026-02-30', '2026-03-01')).toThrow(BadRequestException);
    expect(() => parseReportDateRange('2026-08-01T00:00:00Z', '2026-08-31')).toThrow(
      BadRequestException
    );
  });

  it('serializes the local calendar date without UTC conversion', () => {
    expect(formatReportCalendarDate(new Date(2026, 7, 31))).toBe('2026-08-31');
  });
});
