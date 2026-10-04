import { Module } from '@nestjs/common';

import { AssetsController } from '@/net-worth/assets.controller';
import { LiabilitiesController } from '@/net-worth/liabilities.controller';
import { NetWorthItemsService } from '@/net-worth/net-worth-items.service';

@Module({
  controllers: [AssetsController, LiabilitiesController],
  providers: [NetWorthItemsService],
})
export class NetWorthModule {}
