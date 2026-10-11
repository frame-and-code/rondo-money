import { ApiProperty } from '@nestjs/swagger';
import {
  ACCOUNT_TYPES,
  type AccountType,
  type NetWorthAccountDto,
  type NetWorthDto,
} from '@rondo/types';

import { NetWorthItemResponse } from '@/net-worth/net-worth-item.response';
import { ApiMoneyProperty } from '@/validation/money.decorator';

export class NetWorthAccountResponse implements NetWorthAccountDto {
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
      'zero when the account was spent past its own money.',
  })
  balance!: string;
}

export class NetWorthResponse implements NetWorthDto {
  @ApiMoneyProperty({
    description:
      'What the accounts hold, plus what is owned, minus what is owed. Computed when it is ' +
      'asked for and stored nowhere. It goes below zero when more is owed than held.',
  })
  total!: string;

  @ApiMoneyProperty({
    description: 'What the open accounts hold together. An archived account is not in it.',
  })
  accountsTotal!: string;

  @ApiMoneyProperty({
    sign: 'nonNegative',
    description: 'What the assets the user wrote down are worth together.',
  })
  assetsTotal!: string;

  @ApiMoneyProperty({
    sign: 'nonNegative',
    description: 'What the liabilities the user wrote down come to together, as a plain amount.',
  })
  liabilitiesTotal!: string;

  @ApiProperty({
    type: [NetWorthAccountResponse],
    description: 'The open accounts of the active budget, oldest first.',
  })
  accounts!: NetWorthAccountResponse[];

  @ApiProperty({ type: [NetWorthItemResponse], description: 'The assets, oldest first.' })
  assets!: NetWorthItemResponse[];

  @ApiProperty({ type: [NetWorthItemResponse], description: 'The liabilities, oldest first.' })
  liabilities!: NetWorthItemResponse[];
}
