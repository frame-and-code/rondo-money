import { Inject, Injectable } from '@nestjs/common';
import { type LanguageTag } from '@rondo/types';

import { SCOPED_PRISMA, type ScopedPrismaClient } from '@/prisma/scoped-prisma';
import { toLanguage, toLanguageTag } from '@/user-settings/language';
import { UserSettingsResponse } from '@/user-settings/user-settings.response';

@Injectable()
export class UserSettingsService {
  constructor(@Inject(SCOPED_PRISMA) private readonly prisma: ScopedPrismaClient) {}

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
