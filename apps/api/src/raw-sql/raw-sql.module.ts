import { Global, Module } from '@nestjs/common';

import { AuthFailureStore } from '@/raw-sql/auth-failure-store';
import { DatabaseProbe } from '@/raw-sql/database-probe';
import { ScopedRawRepository } from '@/raw-sql/scoped-raw.repository';

@Global()
@Module({
  providers: [ScopedRawRepository, DatabaseProbe, AuthFailureStore],
  exports: [ScopedRawRepository, DatabaseProbe, AuthFailureStore],
})
export class RawSqlModule {}
