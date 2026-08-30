import { ApiProperty } from '@nestjs/swagger';
import { TARGET_KINDS, type TargetKind } from '@rondo/types';
import { IsIn, registerDecorator, type ValidationArguments } from 'class-validator';

import { IdempotentDto } from '@/categories/categories.dto';
import { ApiMoneyProperty } from '@/validation/money.decorator';
import { ApiCalendarMonthProperty } from '@/validation/month.decorator';

function IsDueMonthOfItsKind(): PropertyDecorator {
  return (target, propertyKey): void => {
    registerDecorator({
      name: 'isDueMonthOfItsKind',
      target: target.constructor,
      propertyName: propertyKey.toString(),
      validator: {
        validate(value: unknown, args: ValidationArguments): boolean {
          const kind = 'kind' in args.object ? args.object.kind : undefined;

          return kind === 'BY_DATE' ? typeof value === 'string' : value === undefined;
        },
        defaultMessage(args: ValidationArguments): string {
          const kind = 'kind' in args.object ? args.object.kind : undefined;

          return kind === 'BY_DATE'
            ? `${args.property} is the month a goal saving by a date is due, and this goal names none`
            : `${args.property} belongs to a goal saving by a date, and this goal has no date`;
        },
      },
    });
  };
}

export class SetCategoryTargetDto extends IdempotentDto {
  @ApiProperty({
    description:
      'What the goal asks of the category. Only a goal saving by a date carries a due month; ' +
      'the other three run until they are replaced or closed.',
    enum: TARGET_KINDS,
    enumName: 'TargetKind',
    example: 'CONTRIBUTE',
  })
  @IsIn(TARGET_KINDS)
  kind!: TargetKind;

  @ApiMoneyProperty({
    sign: 'positive',
    description:
      'What the goal is aiming at, in minor units. A goal of nothing would divide its own ' +
      'progress by zero.',
  })
  amount!: string;

  @ApiCalendarMonthProperty({
    required: false,
    description:
      'The month the amount has to be saved by. Required by that kind, refused by the rest.',
  })
  @IsDueMonthOfItsKind()
  dueMonth?: string;
}
