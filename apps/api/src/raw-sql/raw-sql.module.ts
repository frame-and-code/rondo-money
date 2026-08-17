import { Global, Module } from '@nestjs/common';

import { DatabaseProbe } from '@/raw-sql/database-probe';
import { ScopedRawRepository } from '@/raw-sql/scoped-raw.repository';

/**
 * Global, so the raw aggregates of Phases 4–5 can inject the repository without every module
 * re-importing it — and so there is no incentive to write a "quick" raw query locally
 * instead (see `scoped-raw.repository.ts`).
 */
@Global()
@Module({
  providers: [ScopedRawRepository, DatabaseProbe],
  exports: [ScopedRawRepository, DatabaseProbe],
})
export class RawSqlModule {}
