'use client';

import { UserButton } from '@clerk/nextjs';
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

import { LocaleSwitcher } from '@/components/locale-switcher';
import { useTranslations } from '@/i18n/locale-context';
import { API_BASE_URL } from '@/lib/api';

// Start page (F0.5) + shadcn/ui demo screen (F0.6 DoD): shows the base primitives, the
// theme toggle, and the locale switcher (F0.7) so all three can be checked in one place.
// The app name is a brand, deliberately kept out of the translation dictionaries.
export default function HomePage() {
  const { t } = useTranslations();

  return (
    <main className="mx-auto flex max-w-xl flex-col gap-6 p-8">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Rondo Money</h1>
          <p className="text-sm text-muted-foreground">{t('home.subtitle')}</p>
        </div>
        <div className="flex items-center gap-3">
          <LocaleSwitcher />
          <ThemeToggle
            labels={{
              trigger: t('common.themeToggle.trigger'),
              light: t('common.themeToggle.light'),
              dark: t('common.themeToggle.dark'),
              system: t('common.themeToggle.system'),
            }}
          />
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
          <Separator />
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="budget-name">{t('home.budgetNameLabel')}</Label>
            <Input id="budget-name" placeholder={t('home.budgetNamePlaceholder')} />
          </div>
          <p className="text-sm text-muted-foreground">
            {t('home.apiLabel')}: <code>{API_BASE_URL}</code>
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
