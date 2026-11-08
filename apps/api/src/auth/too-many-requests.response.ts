import { ApiProperty } from '@nestjs/swagger';

export class TooManyRequestsResponse {
  @ApiProperty({ example: 429 })
  statusCode!: number;

  @ApiProperty({ example: 'Too many failed authentication attempts' })
  message!: string;
}
