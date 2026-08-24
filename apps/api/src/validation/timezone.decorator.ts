import { applyDecorators } from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';
import { isTimeZone } from '@rondo/types';
import { registerDecorator } from 'class-validator';

interface TimeZonePropertyOptions {
  description?: string;
  example?: string;
}

export function ApiTimeZoneProperty(options: TimeZonePropertyOptions = {}) {
  return applyDecorators(
    ApiProperty({ type: String, example: 'Europe/Warsaw', ...options }),
    IsIanaTimeZone(),
  );
}

function IsIanaTimeZone(): PropertyDecorator {
  return (target, propertyKey): void => {
    registerDecorator({
      name: 'isIanaTimeZone',
      target: target.constructor,
      propertyName: propertyKey.toString(),
      validator: {
        validate(value: unknown): boolean {
          return typeof value === 'string' && isTimeZone(value);
        },
        defaultMessage(): string {
          return (
            `${propertyKey.toString()} must be a named IANA time zone, such as Europe/Warsaw, ` +
            'or UTC'
          );
        },
      },
    });
  };
}
