import { BadRequestException } from '@nestjs/common';

export interface ParsedReportDateRange {
  startDateTime: Date;
  endDateTime: Date;
}

export function formatReportCalendarDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseCalendarDate(value: string, endOfDay: boolean): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new BadRequestException('Report dates must use YYYY-MM-DD format');

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(
    year,
    month - 1,
    day,
    endOfDay ? 23 : 0,
    endOfDay ? 59 : 0,
    endOfDay ? 59 : 0,
    endOfDay ? 999 : 0
  );

  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    throw new BadRequestException('Report date is not a valid calendar date');
  }

  return date;
}

export function parseReportDateRange(startDate: string, endDate: string): ParsedReportDateRange {
  const startDateTime = parseCalendarDate(startDate, false);
  const endDateTime = parseCalendarDate(endDate, true);

  if (startDateTime > endDateTime) {
    throw new BadRequestException('Report start date must not be after end date');
  }

  return { startDateTime, endDateTime };
}
