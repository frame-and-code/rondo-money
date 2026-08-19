import { Inject, Injectable } from '@nestjs/common';
import { type LanguageTag } from '@rondo/types';

import { SCOPED_PRISMA, type ScopedPrismaClient } from '@/prisma/scoped-prisma';
import { toLanguage, toLanguageTag } from '@/user-settings/language';
import { UserSettingsResponse } from '@/user-settings/user-settings.response';

@Injectable()
export class UserSettingsService {
  // `SCOPED_PRISMA`, never `PrismaService`: with no RLS behind us (ADR-005) the `where
  // user_id` below is added by the extension, not by anyone remembering to write it.
  constructor(@Inject(SCOPED_PRISMA) private readonly prisma: ScopedPrismaClient) {}

  /**
   * The caller's settings, creating them on first sight.
   *
   * Read first, write only on a miss — rather than an unconditional `upsert`. The scoping
   * extension rewrites an upsert's `update` payload to `{ userId }`, so an unconditional one
   * would issue a real UPDATE on every read and keep `updatedAt` permanently equal to "the
   * last time anyone loaded a screen", which is not what the column claims to mean.
   *
   * The miss is closed with an `upsert` rather than a bare `create` because two first
   * requests can arrive at once (the app fires this on sign-in, and a double-render or a
   * retry is enough): both would find nothing, and the second `create` would hit the unique
   * index on `user_id`. The upsert makes the loser a no-op instead of a 500.
   *
   * `userId` is passed into `create` because Prisma's types require an owner; the extension
   * overwrites it with the verified caller regardless, which is what makes passing the wrong
   * one impossible rather than merely discouraged.
   */
  async readOrCreate(userId: string, detected: LanguageTag): Promise<UserSettingsResponse> {
    const existing = await this.prisma.userSettings.findUnique({ where: { userId } });
    if (existing) {
      return { language: toLanguageTag(existing.language) };
    }

    const created = await this.prisma.userSettings.upsert({
      where: { userId },
      create: { userId, language: toLanguage(detected) },
      update: {},
    });

    return { language: toLanguageTag(created.language) };
  }
}
