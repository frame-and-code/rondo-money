import { applyDecorators } from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';
import {
  MONEY_MAX_LENGTH,
  MONEY_NON_NEGATIVE_PATTERN,
  MONEY_PATTERN,
  MONEY_POSITIVE_PATTERN,
  isStorableMoney,
  parseMoney,
} from '@rondo/types';
import { registerDecorator } from 'class-validator';

type MoneySign = 'signed' | 'nonNegative' | 'positive';

const BOUNDS: Record<MoneySign, { pattern: RegExp; example: string; says: string }> = {
  signed: { pattern: MONEY_PATTERN, example: '-4500', says: '' },
  nonNegative: {
    pattern: MONEY_NON_NEGATIVE_PATTERN,
    example: '4500',
    says: ', and it cannot be negative',
  },
  positive: {
    pattern: MONEY_POSITIVE_PATTERN,
    example: '4500',
    says: ', and it must be above zero',
  },
};

interface MoneyPropertyOptions {
  description?: string;
  example?: string;

  sign?: MoneySign;
}

export function ApiMoneyProperty(options: MoneyPropertyOptions = {}) {
  const { sign = 'signed', ...published } = options;
  const bound = BOUNDS[sign];

  return applyDecorators(
    ApiProperty({
      type: String,
      pattern: bound.pattern.source,
      maxLength: MONEY_MAX_LENGTH,
      example: bound.example,
      ...published,
    }),
    IsMoneyString(sign),
  );
}

function IsMoneyString(sign: MoneySign): PropertyDecorator {
  const bound = BOUNDS[sign];

  return (target, propertyKey): void => {
    registerDecorator({
      name: 'isMoneyString',
      target: target.constructor,
      propertyName: propertyKey.toString(),
      validator: {
        validate(value: unknown): boolean {
          if (typeof value !== 'string' || value.length > MONEY_MAX_LENGTH) return false;
          if (!bound.pattern.test(value)) return false;

          return isStorableMoney(parseMoney(value));
        },
        defaultMessage(): string {
          return (
            `${propertyKey.toString()} must be an integer amount of minor units, sent as a ` +
            'string, and within the range the account can hold' +
            bound.says
          );
        },
      },
    });
  };
}
