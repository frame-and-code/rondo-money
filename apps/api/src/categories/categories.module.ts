import { Module } from '@nestjs/common';

import { CategoriesController } from '@/categories/categories.controller';
import { CategoriesService } from '@/categories/categories.service';
import { CategoryGroupsController } from '@/categories/category-groups.controller';
import { CategoryGroupsService } from '@/categories/category-groups.service';
import { CategoryPaidController } from '@/categories/category-paid.controller';
import { CategoryPaidService } from '@/categories/category-paid.service';
import { CategoryTargetsController } from '@/categories/category-targets.controller';
import { CategoryTargetsService } from '@/categories/category-targets.service';

@Module({
  controllers: [
    CategoryGroupsController,
    CategoriesController,
    CategoryTargetsController,
    CategoryPaidController,
  ],
  providers: [
    CategoryGroupsService,
    CategoriesService,
    CategoryTargetsService,
    CategoryPaidService,
  ],
})
export class CategoriesModule {}
