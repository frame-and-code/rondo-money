import { applyDecorators } from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';
import { MONEY_MAX_LENGTH, MONEY_PATTERN, isStorableMoney, parseMoney } from '@rondo/types';
import { registerDecorator } from 'class-validator';

interface MoneyPropertyOptions {
  description?: string;
  example?: string;
}

export function ApiMoneyProperty(options: MoneyPropertyOptions = {}) {
  return applyDecorators(
    ApiProperty({
      type: String,
      pattern: MONEY_PATTERN.source,
      maxLength: MONEY_MAX_LENGTH,
      example: '-4500',
      ...options,
    }),
    IsMoneyString(),
  );
}

function IsMoneyString(): PropertyDecorator {
  return (target, propertyKey): void => {
    registerDecorator({
      name: 'isMoneyString',
      target: target.constructor,
      propertyName: propertyKey.toString(),
      validator: {
        validate(value: unknown): boolean {
          if (typeof value !== 'string' || value.length > MONEY_MAX_LENGTH) return false;
          if (!MONEY_PATTERN.test(value)) return false;

          return isStorableMoney(parseMoney(value));
        },
        defaultMessage(): string {
          return (
            `${propertyKey.toString()} must be an integer amount of minor units, sent as a ` +
            'string, and within the range the account can hold'
          );
        },
      },
    });
  };
}
