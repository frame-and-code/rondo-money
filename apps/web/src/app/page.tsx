'use client';

import { useAuth, UserButton } from '@clerk/nextjs';
import { meControllerIdentifyOptions } from '@rondo/api-client/react-query';
import { ThemeToggle } from '@rondo/ui/components/theme-toggle';
import { Button } from '@rondo/ui/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@rondo/ui/components/ui/card';
import { Input } from '@rondo/ui/components/ui/input';
import { Label } from '@rondo/ui/components/ui/label';
import { Separator } from '@rondo/ui/components/ui/separator';
import { useQuery } from '@tanstack/react-query';

import { LocaleSwitcher } from '@/components/locale-switcher';
import { useTranslations } from '@/i18n/locale-context';
import { API_BASE_URL } from '@/lib/api';

export default function HomePage() {
  const { t } = useTranslations();
  const { isLoaded, isSignedIn } = useAuth();

  const { data, isError } = useQuery({
    ...meControllerIdentifyOptions(),
    enabled: isLoaded && isSignedIn,
  });

  let caller = t('home.callerLoading');
  if (isLoaded && !isSignedIn) {
    caller = t('home.callerSignedOut');
  } else if (isError) {
    caller = t('home.callerUnavailable');
  } else if (data) {
    caller = data.userId;
  }

  return (
    <main className="mx-auto flex max-w-xl flex-col gap-6 p-8">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Rondo Money</h1>
          <p className="text-sm text-muted-foreground">{t('home.subtitle')}</p>
        </div>
        <div className="flex items-center gap-3">
          <LocaleSwitcher />
          <ThemeToggle label={t('common.themeToggle.trigger')} />
          <UserButton />
        </div>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>{t('home.demoTitle')}</CardTitle>
          <CardDescription>{t('home.demoDescription')}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-2">
            <Button>{t('home.buttons.default')}</Button>
            <Button variant="secondary">{t('home.buttons.secondary')}</Button>
            <Button variant="outline">{t('home.buttons.outline')}</Button>
            <Button variant="ghost">{t('home.buttons.ghost')}</Button>
            <Button variant="destructive">{t('home.buttons.destructive')}</Button>
          </div>
          <Separator aria-hidden />
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="budget-name">{t('home.budgetNameLabel')}</Label>
            <Input id="budget-name" placeholder={t('home.budgetNamePlaceholder')} />
          </div>
          <p className="text-sm text-muted-foreground">
            {t('home.apiLabel')}: <code>{API_BASE_URL}</code>
          </p>
          <p className="text-sm text-muted-foreground">
            {t('home.callerLabel')}: <code>{caller}</code>
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
