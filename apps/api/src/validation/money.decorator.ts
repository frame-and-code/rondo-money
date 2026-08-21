import { applyDecorators } from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';
import { MONEY_MAX_LENGTH, MONEY_PATTERN, isStorableMoney, parseMoney } from '@rondo/types';
import { registerDecorator } from 'class-validator';

/**
 * What a money field may say about itself, beyond being money.
 *
 * Spelled out rather than derived from `ApiPropertyOptions`, which is a union whose members
 * disagree about required keys — `Omit` over it collapses into a shape that demands
 * `enumName`. A short explicit list also states the point: `type` and `pattern` are not the
 * caller's to choose, because that is the whole guarantee this decorator makes.
 *
 * `required` and `nullable` are deliberately absent, and their absence is load-bearing. They
 * reach `@ApiProperty` but cannot reach the validator, so declaring one would publish a field
 * a client may omit or send as `null` while the pipe answers 400 — the exact contract-versus-
 * guard split this decorator exists to make impossible. An optional amount needs the two sides
 * moved together (`IsOptional()` beside the schema flag) and a test for each; until something
 * needs one, the option that cannot be honoured is not offered.
 */
interface MoneyPropertyOptions {
  description?: string;
  example?: string;
}

/**
 * Declares a money field: a **string** of integer minor units, both in the OpenAPI schema and
 * to the validating pipe.
 *
 * One decorator for both because they must never disagree, and nothing here would catch it if
 * they did. There is no `@nestjs/swagger` CLI plugin in this app (`nest-cli.json`), so a
 * validation decorator contributes nothing to the published schema on its own — a field
 * carrying `@ApiProperty` and `@IsMoneyString` separately would be two statements about one
 * value, and a reviewer would have to notice when only one of them was updated.
 *
 * Money is declared `string` rather than `bigint` on purpose. The response class *is* the
 * OpenAPI schema (see `.claude/rules/architecture.md`), so the field has to be the type the
 * document publishes; a global interceptor turning bigints into strings on the way out would
 * make the code say one thing and the contract another. The conversion stays explicit, at
 * `serializeMoney` / `parseMoney` in the service.
 */
export function ApiMoneyProperty(options: MoneyPropertyOptions = {}) {
  return applyDecorators(
    ApiProperty({
      type: String,
      // Published so a client knows the shape before it sends one, and taken from the same
      // constant the validator below uses — see `MONEY_PATTERN` in `packages/types`.
      pattern: MONEY_PATTERN.source,
      // Published alongside the pattern so the bound is part of the contract rather than a
      // surprise from the pipe: a generated client validates the same limit the API enforces.
      maxLength: MONEY_MAX_LENGTH,
      example: '-4500',
      ...options,
    }),
    IsMoneyString(),
  );
}

/**
 * Passes only a string of integer minor units that the money column can actually hold.
 *
 * Three checks, in this order for a reason. A JSON number fails first rather than being
 * coerced: by the time a number reaches here, any amount past `Number.MAX_SAFE_INTEGER` has
 * already lost digits, and accepting it would store a value nobody sent. Length comes before
 * shape so a hundred kilobytes of digits is refused without being parsed — body-parser's
 * 100 kB limit is not a money bound, and `.claude/rules/security.md` asks for bounded strings.
 * Range comes last because it is the only one that has to build a `bigint`, and by then the
 * string is known to be short and well-formed.
 *
 * The length check is a shortcut for the range check, and it is only sound because
 * {@link MONEY_PATTERN} is canonical: an amount cannot be padded into extra characters, so
 * anything too long is genuinely out of range. That is why one message covers both.
 */
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
