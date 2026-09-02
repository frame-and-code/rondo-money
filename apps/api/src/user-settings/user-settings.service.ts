import { Inject, Injectable } from '@nestjs/common';
import { type Prisma } from '@rondo/db';
import { type LanguageTag } from '@rondo/types';

import { MutationService } from '@/mutations/mutation.service';
import { SCOPED_PRISMA, type ScopedPrismaClient } from '@/prisma/scoped-prisma';
import { isLanguageTag, toLanguage, toLanguageTag } from '@/user-settings/language';
import { UpdateUserSettingsDto } from '@/user-settings/update-user-settings.dto';
import { UserSettingsResponse } from '@/user-settings/user-settings.response';

function decodeSettings(stored: Prisma.JsonValue): UserSettingsResponse {
  if (typeof stored !== 'object' || stored === null || Array.isArray(stored)) {
    throw new Error(`Stored settings are not an object: ${JSON.stringify(stored)}`);
  }

  const { language } = stored;
  if (typeof language !== 'string' || !isLanguageTag(language)) {
    throw new Error(`Stored settings carry no language the app renders: ${JSON.stringify(stored)}`);
  }

  return { language };
}

@Injectable()
export class UserSettingsService {
  constructor(
    @Inject(SCOPED_PRISMA) private readonly prisma: ScopedPrismaClient,
    private readonly mutations: MutationService,
  ) {}

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

  update(userId: string, body: UpdateUserSettingsDto): Promise<UserSettingsResponse> {
    const language = toLanguage(body.language);

    return this.mutations.run(
      {
        key: body.idempotencyKey,
        request: { language: body.language },
        decode: decodeSettings,
      },
      async (tx) => {
        const settings = await tx.userSettings.upsert({
          where: { userId },
          create: { userId, language },
          update: { language },
        });

        return { language: toLanguageTag(settings.language) };
      },
    );
  }
}
