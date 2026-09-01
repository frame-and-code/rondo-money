import { ApiProperty } from '@nestjs/swagger';
import { type TransferDto } from '@rondo/types';

import { TransactionResponse } from '@/transactions/transaction.response';

export class TransferResponse implements TransferDto {
  @ApiProperty({ format: 'uuid', description: 'Shared by the two legs of one transfer.' })
  transferId!: string;

  @ApiProperty({
    type: TransactionResponse,
    description: 'The leg on the account the money left, whose amount is below zero.',
  })
  from!: TransactionResponse;

  @ApiProperty({
    type: TransactionResponse,
    description: 'The leg on the account the money arrived on, whose amount is above zero.',
  })
  to!: TransactionResponse;
}
