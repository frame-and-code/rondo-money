import { applyDecorators } from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';
import { CATEGORY_ICONS } from '@rondo/types';
import { IsIn } from 'class-validator';

interface CategoryIconPropertyOptions {
  description?: string;

  required?: boolean;

  nullable?: boolean;
}

export function ApiCategoryIconProperty(options: CategoryIconPropertyOptions = {}) {
  const { required = true, nullable = false, ...published } = options;
  const accepted = nullable ? [...CATEGORY_ICONS, null] : [...CATEGORY_ICONS];

  return applyDecorators(
    ApiProperty({
      enum: CATEGORY_ICONS,
      enumName: 'CategoryIcon',
      example: 'home',
      required,
      nullable,
      ...published,
    }),
    IsIn(accepted),
  );
}
