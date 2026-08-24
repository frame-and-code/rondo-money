import { ApiProperty } from '@nestjs/swagger';

/// What both halves of the boundary answer with. The global pipe reports a list of field
/// failures, a handler refusing a request the pipe cannot judge reports one sentence, and
/// publishing only one of the two shapes would leave a client parsing a body the API never
/// sends. It lives with the document rather than beside a raiser, because those two raisers
/// share it and neither owns it.
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
