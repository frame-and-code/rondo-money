import { ApiProperty } from '@nestjs/swagger';
import { MOVE_SIDE_KINDS, type MoveSideDto as MoveSide, type MoveSideKind } from '@rondo/types';
import { Transform, Type } from 'class-transformer';
import {
  IsIn,
  IsObject,
  IsString,
  Length,
  ValidateNested,
  isUUID,
  registerDecorator,
  type ValidationArguments,
} from 'class-validator';

import { ApiMoneyProperty } from '@/validation/money.decorator';
import { ApiCalendarMonthProperty } from '@/validation/month.decorator';

const trimmed = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

const lowercased = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.toLowerCase() : value;

function IsCategoryOfItsKind(): PropertyDecorator {
  return (target, propertyKey): void => {
    registerDecorator({
      name: 'isCategoryOfItsKind',
      target: target.constructor,
      propertyName: propertyKey.toString(),
      validator: {
        validate(value: unknown, args: ValidationArguments): boolean {
          const kind = 'kind' in args.object ? args.object.kind : undefined;

          return kind === 'CATEGORY'
            ? typeof value === 'string' && isUUID(value)
            : value === undefined;
        },
        defaultMessage(args: ValidationArguments): string {
          const kind = 'kind' in args.object ? args.object.kind : undefined;

          return kind === 'CATEGORY'
            ? `${args.property} must be the uuid of the category this side names`
            : `${args.property} belongs to a category side only, and this side names none`;
        },
      },
    });
  };
}

export class MoveSideDto implements MoveSide {
  @ApiProperty({
    description:
      'Which envelope this side is. Ready to assign is stored nowhere: it is derived from ' +
      'every assignment, so a side naming it writes no row and moves on its own.',
    enum: MOVE_SIDE_KINDS,
    enumName: 'MoveSideKind',
    example: 'CATEGORY',
  })
  @IsIn(MOVE_SIDE_KINDS)
  kind!: MoveSideKind;

  @ApiProperty({
    description: 'Required on a category side, and refused on a ready to assign one.',
    format: 'uuid',
    required: false,
  })
  @Transform(lowercased)
  @IsCategoryOfItsKind()
  categoryId?: string;
}

export class CreateMoveDto {
  @ApiCalendarMonthProperty({
    description:
      'The month whose envelopes the money moves between. Required: a default here would make ' +
      'the write depend on a clock rather than on what the user is looking at.',
  })
  month!: string;

  @ApiMoneyProperty({
    sign: 'positive',
    description:
      'What to move, in minor units. The direction is the two sides, so zero would write a row ' +
      'and change nothing, and a negative amount would be this same move written backwards.',
  })
  amount!: string;

  @ApiProperty({ type: MoveSideDto, description: 'The envelope the money leaves.' })
  @IsObject()
  @ValidateNested()
  @Type(() => MoveSideDto)
  from!: MoveSideDto;

  @ApiProperty({ type: MoveSideDto, description: 'The envelope the money arrives in.' })
  @IsObject()
  @ValidateNested()
  @Type(() => MoveSideDto)
  to!: MoveSideDto;

  @ApiProperty({
    description:
      'Minted once when the form opens, never per request. A key per request makes a double ' +
      'click two moves again.',
    minLength: 1,
    maxLength: 64,
  })
  @IsString()
  @Transform(trimmed)
  @Length(1, 64)
  idempotencyKey!: string;
}
