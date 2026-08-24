import { applyDecorators } from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';
import {
  MONEY_MAX_LENGTH,
  MONEY_NON_NEGATIVE_PATTERN,
  MONEY_PATTERN,
  isStorableMoney,
  parseMoney,
} from '@rondo/types';
import { registerDecorator } from 'class-validator';

interface MoneyPropertyOptions {
  description?: string;
  example?: string;

  /// Publishes the bound and refuses below it together. Stated in only one of the two, the
  /// schema would promise a field the pipe answers 400 for, or the reverse.
  nonNegative?: boolean;
}

export function ApiMoneyProperty(options: MoneyPropertyOptions = {}) {
  const { nonNegative = false, ...published } = options;
  const pattern = nonNegative ? MONEY_NON_NEGATIVE_PATTERN : MONEY_PATTERN;

  return applyDecorators(
    ApiProperty({
      type: String,
      pattern: pattern.source,
      maxLength: MONEY_MAX_LENGTH,
      example: nonNegative ? '4500' : '-4500',
      ...published,
    }),
    IsMoneyString(pattern, nonNegative),
  );
}

function IsMoneyString(pattern: RegExp, nonNegative: boolean): PropertyDecorator {
  return (target, propertyKey): void => {
    registerDecorator({
      name: 'isMoneyString',
      target: target.constructor,
      propertyName: propertyKey.toString(),
      validator: {
        validate(value: unknown): boolean {
          if (typeof value !== 'string' || value.length > MONEY_MAX_LENGTH) return false;
          if (!pattern.test(value)) return false;

          return isStorableMoney(parseMoney(value));
        },
        defaultMessage(): string {
          return (
            `${propertyKey.toString()} must be an integer amount of minor units, sent as a ` +
            'string, and within the range the account can hold' +
            (nonNegative ? ', and it cannot be negative' : '')
          );
        },
      },
    });
  };
}
