import { Module } from '@nestjs/common';

import { CategoriesController } from '@/categories/categories.controller';
import { CategoriesService } from '@/categories/categories.service';
import { CategoryGroupsController } from '@/categories/category-groups.controller';
import { CategoryGroupsService } from '@/categories/category-groups.service';

@Module({
  controllers: [CategoryGroupsController, CategoriesController],
  providers: [CategoryGroupsService, CategoriesService],
})
export class CategoriesModule {}
