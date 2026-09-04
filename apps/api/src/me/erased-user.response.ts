import { ApiProperty } from '@nestjs/swagger';

export class ErasedUserResponse {
  @ApiProperty({
    description:
      'The caller whose data was erased, the same id the token carried. Nothing else is ' +
      'returned, because nothing of theirs is left to describe.',
    example: 'user_2abcDEFghiJKLmnoPQRstuVWxyz',
  })
  userId!: string;
}
