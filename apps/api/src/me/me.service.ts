import { Injectable } from '@nestjs/common';
import { type Prisma } from '@rondo/db';

import { EraseMeDto } from '@/me/erase-me.dto';
import { eraseStatement, eraseUserDataStatements } from '@/me/erase-user-data.query';
import { ErasedUserResponse } from '@/me/erased-user.response';
import { MutationService } from '@/mutations/mutation.service';
import { ScopedRawRepository } from '@/raw-sql/scoped-raw.repository';

function decodeErased(stored: Prisma.JsonValue): ErasedUserResponse {
  if (typeof stored !== 'object' || stored === null || Array.isArray(stored)) {
    throw new Error(`A stored erase is not an object: ${JSON.stringify(stored)}`);
  }

  const { userId } = stored;
  if (typeof userId !== 'string') {
    throw new Error(`A stored erase names no caller: ${JSON.stringify(stored)}`);
  }

  return { userId };
}

@Injectable()
export class MeService {
  constructor(
    private readonly mutations: MutationService,
    private readonly raw: ScopedRawRepository,
  ) {}

  erase(userId: string, body: EraseMeDto): Promise<ErasedUserResponse> {
    const spared = body.idempotencyKey.trim();

    return this.mutations.run(
      { key: body.idempotencyKey, request: { userId }, decode: decodeErased },
      async (tx) => {
        for (const { model } of eraseUserDataStatements({ userId }, spared)) {
          await this.raw.execute((scope) => eraseStatement(scope, model, spared), tx);
        }

        return { userId };
      },
    );
  }
}
