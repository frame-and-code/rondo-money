import { ApiProperty } from '@nestjs/swagger';

export class BadRequestResponse {
  @ApiProperty({ example: 400 })
  statusCode!: number;

  @ApiProperty({ example: 'Bad Request' })
  error!: string;

  @ApiProperty({
    oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }],
    example: ['name must be longer than or equal to 1 characters'],
  })
  message!: string | string[];
}
