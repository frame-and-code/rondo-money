import { ApiProperty } from '@nestjs/swagger';

/// What a mutation answers when its idempotency key was claimed by a different request. It
/// lives beside the service that raises it, because every endpoint taking a key can return it.
export class ConflictResponse {
  @ApiProperty({ example: 409 })
  statusCode!: number;

  @ApiProperty({ example: 'Conflict' })
  error!: string;

  @ApiProperty({
    example:
      'Refusing the mutation carrying key "form-opened-once": the idempotency key was claimed ' +
      "by a different request, and answering with the first one's result would report a write " +
      'it never made',
  })
  message!: string;
}
