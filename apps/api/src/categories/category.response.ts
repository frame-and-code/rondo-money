import { ApiProperty } from '@nestjs/swagger';
import {
  type CategoryColor,
  type CategoryDto,
  type CategoryGroupDto,
  type CategoryIcon,
} from '@rondo/types';

import { ApiCategoryColorProperty } from '@/validation/color.decorator';
import { ApiCategoryIconProperty } from '@/validation/icon.decorator';

export class CategoryGroupResponse implements CategoryGroupDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ description: 'What the user calls this group.' })
  name!: string;

  @ApiProperty({ description: 'Where the group sits in the list, counted from zero.' })
  sortOrder!: number;

  @ApiProperty({
    description:
      'Whether the group carries a hidden marker at all. Which months stop showing it is the ' +
      'month endpoint answer, because that depends on the month being read.',
  })
  hidden!: boolean;
}

export class CategoryResponse implements CategoryDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid', description: 'The group this category sits in.' })
  groupId!: string;

  @ApiProperty({ description: 'What the user calls this category.' })
  name!: string;

  @ApiProperty({ description: 'Where the category sits in its group, counted from zero.' })
  sortOrder!: number;

  @ApiCategoryIconProperty({
    nullable: true,
    description: 'Which icon this category is drawn with, or null when nobody picked one.',
  })
  icon!: CategoryIcon | null;

  @ApiCategoryColorProperty({
    nullable: true,
    description: 'Which colour this category is drawn in, on the same terms as its icon.',
  })
  color!: CategoryColor | null;

  @ApiProperty({ description: 'Whether the category carries a hidden marker at all.' })
  hidden!: boolean;
}
