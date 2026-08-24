import { ApiProperty } from '@nestjs/swagger';
import { ACCOUNT_TYPES, type AccountDto, type AccountType } from '@rondo/types';

export class AccountResponse implements AccountDto {
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
}
