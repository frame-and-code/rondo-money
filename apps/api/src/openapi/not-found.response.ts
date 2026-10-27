import { NotFoundException } from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';

export class NotFoundResponse {
  @ApiProperty({ example: 404 })
  statusCode!: number;

  @ApiProperty({ example: 'Not Found' })
  error!: string;

  @ApiProperty({ example: 'This budget holds no such account.' })
  message!: string;
}

export function refuseMissing(reason: string, message: string): NotFoundException {
  return new NotFoundException({ statusCode: 404, error: 'Not Found', message, reason });
}
