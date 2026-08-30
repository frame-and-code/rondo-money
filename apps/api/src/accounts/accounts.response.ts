import { ApiProperty } from '@nestjs/swagger';
import {
  ACCOUNT_TYPES,
  type AccountBalanceDto,
  type AccountType,
  type AccountsDto,
} from '@rondo/types';

import { ApiMoneyProperty } from '@/validation/money.decorator';

export class AccountBalanceResponse implements AccountBalanceDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ description: 'What the user calls this account.', maxLength: 60 })
  name!: string;

  @ApiProperty({
    description: 'Cash or a debit account.',
    enum: ACCOUNT_TYPES,
    enumName: 'AccountType',
    example: 'CASH',
  })
  type!: AccountType;

  @ApiMoneyProperty({
    description:
      'What the account holds, summed from its transactions rather than stored. It goes below ' +
      'zero, which is a signal rather than an error.',
  })
  balance!: string;
}

export class AccountsResponse implements AccountsDto {
  @ApiProperty({ type: [AccountBalanceResponse] })
  accounts!: AccountBalanceResponse[];

  @ApiMoneyProperty({
    description:
      'What every account listed here holds together. An archived account is in neither the ' +
      'list nor this total, so the rows always add up to it.',
  })
  total!: string;
}
