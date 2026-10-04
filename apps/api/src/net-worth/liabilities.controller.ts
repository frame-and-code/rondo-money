import { Controller } from '@nestjs/common';

import { netWorthItemsController } from '@/net-worth/net-worth-items.controller';

@Controller('liabilities')
export class LiabilitiesController extends netWorthItemsController('liability', {
  one: 'liability',
  aOne: 'a liability',
  many: 'liabilities',
  what: 'Something the user owes that sits on no account: a debt to a friend.',
}) {}
