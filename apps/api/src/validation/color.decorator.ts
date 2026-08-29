import { applyDecorators } from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';
import { CATEGORY_COLORS } from '@rondo/types';
import { IsIn } from 'class-validator';

interface CategoryColorPropertyOptions {
  description?: string;

  required?: boolean;

  nullable?: boolean;
}

export function ApiCategoryColorProperty(options: CategoryColorPropertyOptions = {}) {
  const { required = true, nullable = false, ...published } = options;
  const accepted = nullable ? [...CATEGORY_COLORS, null] : [...CATEGORY_COLORS];

  return applyDecorators(
    ApiProperty({
      enum: CATEGORY_COLORS,
      enumName: 'CategoryColor',
      example: 'blue',
      required,
      nullable,
      ...published,
    }),
    IsIn(accepted),
  );
}
