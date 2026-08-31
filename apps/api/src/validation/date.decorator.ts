import { applyDecorators } from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';
import { CALENDAR_DATE_PATTERN, parseCalendarDate } from '@rondo/types';
import { registerDecorator } from 'class-validator';

interface CalendarDatePropertyOptions {
  description?: string;
  example?: string;

  required?: boolean;
}

export function ApiCalendarDateProperty(options: CalendarDatePropertyOptions = {}) {
  const { required = true, ...published } = options;

  return applyDecorators(
    ApiProperty({
      type: String,
      pattern: CALENDAR_DATE_PATTERN.source,
      example: '2026-08-31',
      required,
      ...published,
    }),
    IsCalendarDate(required),
  );
}

function IsCalendarDate(required: boolean): PropertyDecorator {
  return (target, propertyKey): void => {
    registerDecorator({
      name: 'isCalendarDate',
      target: target.constructor,
      propertyName: propertyKey.toString(),
      validator: {
        validate(value: unknown): boolean {
          if (!required && value === undefined) {
            return true;
          }

          if (typeof value !== 'string') {
            return false;
          }

          try {
            parseCalendarDate(value);
          } catch {
            return false;
          }

          return true;
        },
        defaultMessage(): string {
          return `${propertyKey.toString()} must be a calendar date written as YYYY-MM-DD`;
        },
      },
    });
  };
}
