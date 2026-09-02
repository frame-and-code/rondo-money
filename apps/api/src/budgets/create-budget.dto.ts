import { ApiProperty } from '@nestjs/swagger';
import { type LanguageTag } from '@rondo/types';
import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsString, Length } from 'class-validator';

import { LANGUAGE_TAGS } from '@/user-settings/language';
import { ApiCurrencyProperty } from '@/validation/currency.decorator';
import { ApiTimeZoneProperty } from '@/validation/timezone.decorator';

const trimmed = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class CreateBudgetDto {
  @ApiProperty({
    description:
      'The interface language the user picked on this screen. It is a property of the user ' +
      'rather than of the budget, and it is stored in their settings. It travels with the ' +
      'budget because the default categories are written in it.',
    enum: LANGUAGE_TAGS,
    enumName: 'LanguageTag',
    example: 'en',
  })
  @IsIn(LANGUAGE_TAGS)
  language!: LanguageTag;

  @ApiProperty({ description: 'What the user calls this budget.', minLength: 1, maxLength: 60 })
  @IsString()
  @Transform(trimmed)
  @Length(1, 60)
  name!: string;

  @ApiCurrencyProperty({
    description: "Chosen once. No endpoint changes a budget's currency afterwards.",
  })
  currency!: string;

  @ApiTimeZoneProperty({
    description:
      'The zone the budget counts days in. The browser reads it from the device; there is no ' +
      'field for it on the screen.',
  })
  timezone!: string;

  @ApiProperty({
    description:
      'Whether to create the starter groups and categories alongside the budget. Required: a ' +
      'default here would mean the server decided what the user wanted.',
  })
  @IsBoolean()
  withDefaultCategories!: boolean;

  @ApiProperty({
    description:
      'Minted once when the form opens, never per request. A key per request makes a double ' +
      'click two budgets again.',
    minLength: 1,
    maxLength: 64,
  })
  @IsString()
  @Transform(trimmed)
  @Length(1, 64)
  idempotencyKey!: string;
}
