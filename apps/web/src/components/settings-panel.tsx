'use client';

import { useUser } from '@clerk/nextjs';
import { meControllerEraseMutation } from '@rondo/api-client/react-query';
import { ThemeSelect, type Theme } from '@rondo/ui/components/theme-select';
import { Alert, AlertDescription, AlertTitle } from '@rondo/ui/components/ui/alert';
import { Button } from '@rondo/ui/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@rondo/ui/components/ui/dialog';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@rondo/ui/components/ui/drawer';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@rondo/ui/components/ui/select';
import { useIsMobile } from '@rondo/ui/hooks/use-mobile';
import { cn } from '@rondo/ui/lib/utils';
import { IconAlertCircle } from '@tabler/icons-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useCallback, useRef, useState } from 'react';

import { EraseDataDialog, type EraseIntent } from '@/components/erase-data-dialog';
import { useTranslations } from '@/i18n/locale-context';
import { isLocale, locales, localeLabels, type Locale } from '@/i18n/locales';
import type { MessageKey } from '@/i18n/messages';
import { useLanguageChoice } from '@/i18n/settings-locale';
import { SIGN_IN_URL } from '@/lib/auth';
import { eraseFailure } from '@/lib/erase-failure';
import { onboardingRoute } from '@/lib/onboarding';

import type { ReactNode } from 'react';

interface Erasing {
  intent: EraseIntent;
  key: string;
}

const FADE_MS = 150;

function Section({ title, note, children }: { title: string; note: string; children: ReactNode }) {
  return (
    <section className="flex max-w-md flex-col gap-3">
      <h1 className="text-2xl font-semibold">{title}</h1>
      {children}
      <p className="text-muted-foreground text-sm">{note}</p>
    </section>
  );
}

export function SettingsPanel() {
  const { t } = useTranslations();
  const { language, choose, saving, failed, dismiss } = useLanguageChoice();

  const router = useRouter();
  const isMobile = useIsMobile();
  const queryClient = useQueryClient();
  const { user } = useUser();
  const erase = useMutation(meControllerEraseMutation());

  const [erasing, setErasing] = useState<Erasing | null>(null);
  const [eraseFailed, setEraseFailed] = useState<MessageKey | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [erased, setErased] = useState(false);
  const lastErasing = useRef<Erasing | null>(null);

  const [fading, setFading] = useState(false);
  const [picked, setPicked] = useState<Locale | null>(null);

  const fadeThen = useCallback((apply: () => void) => {
    setFading(true);
    window.setTimeout(() => {
      apply();
      setFading(false);
    }, FADE_MS);
  }, []);

  const closeErasing = useCallback(() => {
    if (leaving || erase.isPending) return;
    setErasing(null);
    setEraseFailed(null);

    if (erased) {
      setErased(false);
      void queryClient.resetQueries();
      router.replace(onboardingRoute('budget'));
    }
  }, [leaving, erase.isPending, erased, queryClient, router]);

  const openErasing = (intent: EraseIntent): void => {
    setEraseFailed(null);
    setErasing({ intent, key: crypto.randomUUID() });
  };

  const leaveForGood = async (): Promise<void> => {
    if (!user) {
      setEraseFailed('settings.eraseFailedAccount');
      return;
    }

    setLeaving(true);
    try {
      await user.delete();
      router.replace(SIGN_IN_URL);
    } catch {
      setEraseFailed('settings.eraseFailedAccount');
    } finally {
      setLeaving(false);
    }
  };

  const confirmErasing = (): void => {
    if (erasing === null) return;
    const { intent, key } = erasing;

    erase.mutate(
      { body: { idempotencyKey: key } },
      {
        onSuccess: () => {
          if (intent === 'delete') {
            setErased(true);
            void leaveForGood();
            return;
          }

          setErasing(null);
          void queryClient.resetQueries();
          router.replace(onboardingRoute('budget'));
        },
        onError: (error: unknown) => {
          const answer = eraseFailure(error);
          setEraseFailed(answer.message);
          if (!answer.keepsTheKey) {
            setErasing({ intent, key: crypto.randomUUID() });
          }
        },
      },
    );
  };

  if (erasing !== null) {
    lastErasing.current = erasing;
  }
  const shownErasing = erasing ?? lastErasing.current;

  const erasingSurface =
    shownErasing === null ? null : (
      <EraseDataDialog
        key={shownErasing.intent}
        intent={shownErasing.intent}
        failed={eraseFailed}
        busy={erase.isPending || leaving}
        onConfirm={confirmErasing}
        onCancel={closeErasing}
      />
    );

  const themeLabels: Record<Theme, string> = {
    system: t('settings.themeSystem'),
    light: t('settings.themeLight'),
    dark: t('settings.themeDark'),
  };

  return (
    <div
      data-testid="settings-panel"
      className={cn(
        'flex flex-col gap-10 transition-opacity duration-150',
        fading ? 'opacity-0' : 'opacity-100',
      )}
    >
      {failed ? (
        <Alert variant="destructive" className="max-w-md">
          <IconAlertCircle />
          <AlertTitle>{t('settings.saveFailedTitle')}</AlertTitle>
          <AlertDescription>{t('settings.saveFailed')}</AlertDescription>
          <Button
            type="button"
            variant="ghost"
            className="mt-2 h-8 justify-self-start"
            onClick={dismiss}
          >
            {t('settings.saveFailedDismiss')}
          </Button>
        </Alert>
      ) : null}

      <Section title={t('settings.language')} note={t('settings.languageNote')}>
        <Select
          value={language}
          disabled={saving}
          onValueChange={(next: string | null) => {
            if (next !== null && isLocale(next) && next !== language) {
              setPicked(next);
            }
          }}
          onOpenChangeComplete={(open: boolean) => {
            if (open || picked === null) return;

            setPicked(null);
            fadeThen(() => choose(picked));
          }}
        >
          <SelectTrigger aria-label={t('settings.language')} className="w-full">
            <SelectValue>{(picked: Locale) => localeLabels[picked]}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {locales.map((option) => (
              <SelectItem key={option} value={option}>
                {localeLabels[option]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Section>

      <Section title={t('settings.theme')} note={t('settings.themeNote')}>
        <ThemeSelect label={t('settings.theme')} labels={themeLabels} className="w-full" />
      </Section>

      <Section title={t('settings.danger')} note={t('settings.dangerNote')}>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            type="button"
            variant="outline"
            className="rounded-2xl"
            onClick={() => openErasing('reset')}
          >
            {t('settings.reset')}
          </Button>
          <Button
            type="button"
            variant="destructive"
            className="rounded-2xl"
            onClick={() => openErasing('delete')}
          >
            {t('settings.delete')}
          </Button>
        </div>
      </Section>

      {isMobile ? (
        <Drawer
          showSwipeHandle
          open={erasing !== null}
          onOpenChange={(next: boolean) => (next ? null : closeErasing())}
        >
          <DrawerContent className="max-h-[92dvh]">
            <DrawerHeader className="pb-0">
              <DrawerTitle className="sr-only">{t('settings.danger')}</DrawerTitle>
            </DrawerHeader>
            <div className="overflow-y-auto px-4 pb-6">{erasingSurface}</div>
          </DrawerContent>
        </Drawer>
      ) : (
        <Dialog
          open={erasing !== null}
          onOpenChange={(next: boolean) => (next ? null : closeErasing())}
        >
          <DialogContent
            showCloseButton={!erase.isPending && !leaving}
            className="gap-0 rounded-[24px] p-6 sm:max-w-[480px]"
          >
            <DialogTitle className="sr-only">{t('settings.danger')}</DialogTitle>
            <DialogDescription className="sr-only">{t('settings.dangerNote')}</DialogDescription>
            {erasingSurface}
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
