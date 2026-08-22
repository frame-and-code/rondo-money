import { ApiProperty } from '@nestjs/swagger';

export class CurrentUserResponse {
  @ApiProperty({
    description:
      "The caller's Clerk user id, taken from the verified token's `sub` claim. Every record " +
      'this user owns is scoped by exactly this value (ADR-005).',
    example: 'user_2abcDEFghiJKLmnoPQRstuVWxyz',
  })
  userId!: string;
}
