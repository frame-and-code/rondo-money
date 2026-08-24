import { Module } from '@nestjs/common';

import { AccountsController } from '@/accounts/accounts.controller';
import { AccountsService } from '@/accounts/accounts.service';

@Module({
  controllers: [AccountsController],
  providers: [AccountsService],
})
export class AccountsModule {}
