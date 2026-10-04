import { Controller } from '@nestjs/common';

import { netWorthItemsController } from '@/net-worth/net-worth-items.controller';

@Controller('assets')
export class AssetsController extends netWorthItemsController('asset', {
  one: 'asset',
  aOne: 'an asset',
  many: 'assets',
  what: 'Something the user owns that sits on no account: a flat, a car.',
}) {}
