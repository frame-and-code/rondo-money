import { ApiProperty } from '@nestjs/swagger';
import { type Prisma } from '@rondo/db';
import { type ReconciliationDto } from '@rondo/types';

import { ApiMoneyProperty } from '@/validation/money.decorator';

export class ReconciliationResponse implements ReconciliationDto {
  @ApiMoneyProperty({
    description:
      'What the correction came to, in minor units and signed: below zero when the account ' +
      'held less than the book said. Zero when the two already agreed, and then nothing was ' +
      'written at all.',
  })
  difference!: string;

  @ApiProperty({
    type: String,
    format: 'uuid',
    nullable: true,
    description:
      'The correction that was written, and null when the difference was zero. It is an ' +
      'ordinary record: it is edited and removed through the transaction operations.',
  })
  adjustmentId!: string | null;
}

export function decodeReconciliation(stored: Prisma.JsonValue): ReconciliationResponse {
  if (typeof stored !== 'object' || stored === null || Array.isArray(stored)) {
    throw new Error(`A stored reconciliation is not an object: ${JSON.stringify(stored)}`);
  }

  const { difference, adjustmentId } = stored;
  if (typeof difference !== 'string') {
    throw new Error(`A stored reconciliation is missing fields: ${JSON.stringify(stored)}`);
  }

  return { difference, adjustmentId: typeof adjustmentId === 'string' ? adjustmentId : null };
}
