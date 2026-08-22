'use client';

import { useAuth } from '@clerk/nextjs';
import { userSettingsControllerReadOptions } from '@rondo/api-client/react-query';
import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';

import { useTranslations } from '@/i18n/locale-context';

export function SettingsLocaleSync() {
  const { isLoaded, isSignedIn, userId } = useAuth();
  const { applySettingsLocale } = useTranslations();

  let caller: string | null | undefined;
  if (isLoaded) {
    caller = isSignedIn ? (userId ?? null) : null;
  }

  const { data } = useQuery({
    ...userSettingsControllerReadOptions(),
    enabled: typeof caller === 'string',
  });

  const language = data?.language;

  useEffect(() => {
    applySettingsLocale(caller, language ?? null);
  }, [caller, language, applySettingsLocale]);

  return null;
}
