import { Global, Module } from '@nestjs/common';

import { MutationService } from '@/mutations/mutation.service';

@Global()
@Module({
  providers: [MutationService],
  exports: [MutationService],
})
export class MutationsModule {}
