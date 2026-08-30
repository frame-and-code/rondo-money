import { Module } from '@nestjs/common';

import { CategoriesController } from '@/categories/categories.controller';
import { CategoriesService } from '@/categories/categories.service';
import { CategoryGroupsController } from '@/categories/category-groups.controller';
import { CategoryGroupsService } from '@/categories/category-groups.service';
import { CategoryTargetsController } from '@/categories/category-targets.controller';
import { CategoryTargetsService } from '@/categories/category-targets.service';

@Module({
  controllers: [CategoryGroupsController, CategoriesController, CategoryTargetsController],
  providers: [CategoryGroupsService, CategoriesService, CategoryTargetsService],
})
export class CategoriesModule {}
