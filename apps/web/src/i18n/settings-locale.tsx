'use client';

import { useAuth } from '@clerk/nextjs';
import {
  userSettingsControllerReadOptions,
  userSettingsControllerReadQueryKey,
  userSettingsControllerUpdateMutation,
} from '@rondo/api-client/react-query';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';

import { useTranslations } from '@/i18n/locale-context';
import { type Locale } from '@/i18n/locales';

function callerOf(isLoaded: boolean, isSignedIn: boolean, userId: string | null | undefined) {
  if (!isLoaded) return undefined;
  return isSignedIn ? (userId ?? null) : null;
}

export function SettingsLocaleSync() {
  const { isLoaded, isSignedIn, userId } = useAuth();
  const { applySettingsLocale } = useTranslations();

  const caller = callerOf(isLoaded, Boolean(isSignedIn), userId);

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

export interface LanguageChoice {
  language: Locale;
  choose: (next: Locale) => void;
  saving: boolean;
  failed: boolean;
  dismiss: () => void;
}

export function useLanguageChoice(): LanguageChoice {
  const { locale, setLocale } = useTranslations();
  const queryClient = useQueryClient();
  const [failed, setFailed] = useState(false);

  const update = useMutation(userSettingsControllerUpdateMutation());

  const choose = useCallback(
    (next: Locale) => {
      const before = locale;
      setFailed(false);
      setLocale(next);

      update.mutate(
        { body: { language: next, idempotencyKey: crypto.randomUUID() } },
        {
          onSuccess: (settings) => {
            queryClient.setQueryData(userSettingsControllerReadQueryKey(), settings);
          },
          onError: () => {
            setLocale(before);
            setFailed(true);
          },
        },
      );
    },
    [locale, setLocale, update, queryClient],
  );

  return {
    language: locale,
    choose,
    saving: update.isPending,
    failed,
    dismiss: () => setFailed(false),
  };
}
