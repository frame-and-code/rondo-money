import { ApiProperty } from '@nestjs/swagger';
import { type CategoryColor, type CategoryIcon } from '@rondo/types';
import { Transform } from 'class-transformer';
import { ArrayNotEmpty, IsArray, IsOptional, IsString, IsUUID, Length } from 'class-validator';

import { ApiCategoryColorProperty } from '@/validation/color.decorator';
import { ApiCategoryIconProperty } from '@/validation/icon.decorator';

const trimmed = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

const lowercased = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.toLowerCase() : value;

export const NAME_MAX = 60;

class KeyedDto {
  @ApiProperty({
    description:
      'Minted once when the form opens, never per request. A key per request makes a double ' +
      'click two writes again.',
    minLength: 1,
    maxLength: 64,
  })
  @IsString()
  @Transform(trimmed)
  @Length(1, 64)
  idempotencyKey!: string;
}

export class IdempotentDto extends KeyedDto {}

export class CreateCategoryGroupDto extends KeyedDto {
  @ApiProperty({ description: 'What the user calls this group.', maxLength: NAME_MAX })
  @IsString()
  @Transform(trimmed)
  @Length(1, NAME_MAX)
  name!: string;
}

export class UpdateCategoryGroupDto extends CreateCategoryGroupDto {}

export class ReorderCategoryGroupsDto extends KeyedDto {
  @ApiProperty({
    description:
      'The groups of the budget, in the order the user left them. Fewer than the budget holds ' +
      'is allowed; the rest keep their order behind the named ones.',
    type: [String],
    format: 'uuid',
  })
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('all', { each: true })
  groupIds!: string[];
}

export class CreateCategoryDto extends KeyedDto {
  @ApiProperty({ format: 'uuid', description: 'The group the category is created in.' })
  @Transform(lowercased)
  @IsUUID()
  groupId!: string;

  @ApiProperty({ description: 'What the user calls this category.', maxLength: NAME_MAX })
  @IsString()
  @Transform(trimmed)
  @Length(1, NAME_MAX)
  name!: string;

  @ApiCategoryIconProperty({ required: false, description: 'Which icon it is drawn with.' })
  @IsOptional()
  icon?: CategoryIcon;

  @ApiCategoryColorProperty({ required: false, description: 'Which colour it is drawn in.' })
  @IsOptional()
  color?: CategoryColor;
}

export class UpdateCategoryDto extends KeyedDto {
  @ApiProperty({ format: 'uuid', required: false, description: 'The group to move it into.' })
  @IsOptional()
  @Transform(lowercased)
  @IsUUID()
  groupId?: string;

  @ApiProperty({ required: false, maxLength: NAME_MAX, description: 'What to call it now.' })
  @IsOptional()
  @IsString()
  @Transform(trimmed)
  @Length(1, NAME_MAX)
  name?: string;

  @ApiCategoryIconProperty({ required: false, description: 'Which icon it is drawn with.' })
  @IsOptional()
  icon?: CategoryIcon;

  @ApiCategoryColorProperty({ required: false, description: 'Which colour it is drawn in.' })
  @IsOptional()
  color?: CategoryColor;
}

export class ReorderCategoriesDto extends KeyedDto {
  @ApiProperty({ format: 'uuid', description: 'The group whose order is being rewritten.' })
  @Transform(lowercased)
  @IsUUID()
  groupId!: string;

  @ApiProperty({
    description:
      'The categories of that group, in the order the user left them. Fewer than the group ' +
      'holds is allowed; the rest keep their order behind the named ones.',
    type: [String],
    format: 'uuid',
  })
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('all', { each: true })
  categoryIds!: string[];
}
