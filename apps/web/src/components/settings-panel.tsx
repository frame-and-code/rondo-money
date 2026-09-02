'use client';

import { ThemeSelect, type Theme } from '@rondo/ui/components/theme-select';
import { Alert, AlertDescription, AlertTitle } from '@rondo/ui/components/ui/alert';
import { Button } from '@rondo/ui/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@rondo/ui/components/ui/select';
import { cn } from '@rondo/ui/lib/utils';
import { IconAlertCircle } from '@tabler/icons-react';
import { useCallback, useState } from 'react';

import { useTranslations } from '@/i18n/locale-context';
import { isLocale, locales, localeLabels, type Locale } from '@/i18n/locales';
import { useLanguageChoice } from '@/i18n/settings-locale';

import type { ReactNode } from 'react';

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

  const [fading, setFading] = useState(false);
  const [picked, setPicked] = useState<Locale | null>(null);

  const fadeThen = useCallback((apply: () => void) => {
    setFading(true);
    window.setTimeout(() => {
      apply();
      setFading(false);
    }, FADE_MS);
  }, []);

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
    </div>
  );
}
