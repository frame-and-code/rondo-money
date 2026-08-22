import { Global, Module } from '@nestjs/common';

import { DatabaseProbe } from '@/raw-sql/database-probe';
import { ScopedRawRepository } from '@/raw-sql/scoped-raw.repository';

@Global()
@Module({
  providers: [ScopedRawRepository, DatabaseProbe],
  exports: [ScopedRawRepository, DatabaseProbe],
})
export class RawSqlModule {}
