import { applyDecorators, SetMetadata } from '@nestjs/common';
import { ApiExtension } from '@nestjs/swagger';

export const IS_PUBLIC_KEY = 'auth:isPublic';

export const PUBLIC_OPERATION_EXTENSION = 'x-public';

export const Public = (): ReturnType<typeof applyDecorators> =>
  applyDecorators(SetMetadata(IS_PUBLIC_KEY, true), ApiExtension(PUBLIC_OPERATION_EXTENSION, true));
