import { applyDecorators } from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';
import { CURRENCY_PATTERN, isSupportedCurrency } from '@rondo/types';
import { registerDecorator } from 'class-validator';

interface CurrencyPropertyOptions {
  description?: string;
  example?: string;
}

export function ApiCurrencyProperty(options: CurrencyPropertyOptions = {}) {
  return applyDecorators(
    ApiProperty({
      type: String,
      pattern: CURRENCY_PATTERN.source,
      example: 'PLN',
      ...options,
    }),
    IsSupportedCurrency(),
  );
}

function IsSupportedCurrency(): PropertyDecorator {
  return (target, propertyKey): void => {
    registerDecorator({
      name: 'isSupportedCurrency',
      target: target.constructor,
      propertyName: propertyKey.toString(),
      validator: {
        validate(value: unknown): boolean {
          return typeof value === 'string' && isSupportedCurrency(value);
        },
        defaultMessage(): string {
          return `${propertyKey.toString()} must be a currency code the app knows, as three uppercase letters`;
        },
      },
    });
  };
}
