import { Module } from '@nestjs/common';

import { AssetsController } from '@/net-worth/assets.controller';
import { LiabilitiesController } from '@/net-worth/liabilities.controller';
import { NetWorthItemsService } from '@/net-worth/net-worth-items.service';
import { NetWorthController } from '@/net-worth/net-worth.controller';
import { NetWorthService } from '@/net-worth/net-worth.service';

@Module({
  controllers: [AssetsController, LiabilitiesController, NetWorthController],
  providers: [NetWorthItemsService, NetWorthService],
})
export class NetWorthModule {}
