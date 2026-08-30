import { applyDecorators } from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';
import { CALENDAR_MONTH_PATTERN } from '@rondo/types';
import { registerDecorator } from 'class-validator';

interface CalendarMonthPropertyOptions {
  description?: string;
  example?: string;

  required?: boolean;
}

export function ApiCalendarMonthProperty(options: CalendarMonthPropertyOptions = {}) {
  const { required = true, ...published } = options;

  return applyDecorators(
    ApiProperty({
      type: String,
      pattern: CALENDAR_MONTH_PATTERN.source,
      example: '2026-02',
      required,
      ...published,
    }),
    IsCalendarMonth(required),
  );
}

function IsCalendarMonth(required: boolean): PropertyDecorator {
  return (target, propertyKey): void => {
    registerDecorator({
      name: 'isCalendarMonth',
      target: target.constructor,
      propertyName: propertyKey.toString(),
      validator: {
        validate(value: unknown): boolean {
          if (!required && value === undefined) {
            return true;
          }

          return typeof value === 'string' && CALENDAR_MONTH_PATTERN.test(value);
        },
        defaultMessage(): string {
          return `${propertyKey.toString()} must be a calendar month written as YYYY-MM`;
        },
      },
    });
  };
}
