'use client';

import {
  budgetsControllerCreateMutation,
  budgetsControllerListQueryKey,
} from '@rondo/api-client/react-query';
import { ThemeToggle } from '@rondo/ui/components/theme-toggle';
import { Button, buttonVariants } from '@rondo/ui/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@rondo/ui/components/ui/card';
import { Checkbox } from '@rondo/ui/components/ui/checkbox';
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxTrigger,
  ComboboxValue,
} from '@rondo/ui/components/ui/combobox';
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from '@rondo/ui/components/ui/command';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from '@rondo/ui/components/ui/drawer';
import { Input } from '@rondo/ui/components/ui/input';
import { Label } from '@rondo/ui/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@rondo/ui/components/ui/select';
import { Separator } from '@rondo/ui/components/ui/separator';
import { useIsMobile } from '@rondo/ui/hooks/use-mobile';
import { cn } from '@rondo/ui/lib/utils';
import {
  IconBuildingBank,
  IconCheck,
  IconChevronDown,
  IconLoader,
  IconLock,
  IconTrendingUp,
  IconWallet,
} from '@tabler/icons-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useMemo, useState, type FormEvent, type ReactNode } from 'react';

import { useTranslations } from '@/i18n/locale-context';
import { localeLabels, locales, type Locale } from '@/i18n/locales';
import { type MessageKey } from '@/i18n/messages';
import { namePlaceholderKey } from '@/i18n/name-placeholders';
import {
  currencyName,
  currencyOptions,
  sampleAmount,
  searchCurrencies,
  type CurrencyOption,
} from '@/lib/currencies';

/// Long enough to read as a change of language, short enough that nobody waits for it. The
/// dictionary is in the bundle, so there is nothing to load and a spinner would be a lie.
const FADE_MS = 150;

/// A tap target on a phone, the design system's own height from the medium breakpoint up.
/// The radius follows the height, so a 44px control is a pill and a 32px one is not. Only the
/// sizes change with the width; the type scale is the same at both.
const CONTROL = 'h-11 rounded-full px-3.5 text-sm md:h-8 md:rounded-2xl md:px-3';

/// The same tokens `Input` carries, because a field that opens a list still has to read as a
/// field beside the one that does not.
const FIELD = cn(
  'bg-input/50 flex w-full items-center justify-between gap-2 border border-transparent text-start transition-colors',
  CONTROL,
);

/// The combobox popup is wider than its anchor by default, which suits a popup hanging under
/// an input and not a field that opens over itself.
const POPUP = 'min-w-(--anchor-width)';

/// A list that opens on a phone is sized for a thumb throughout, not only at its trigger:
/// the search box matches the field that opened it and every row is a tap target.
const SHEET = '**:data-[slot=input-group]:h-11! **:data-[slot=input-group]:rounded-full px-2';
const SHEET_ITEM = 'min-h-12 rounded-2xl px-3 text-sm';

/// Rendering every currency turns the list into a wall and the search into decoration. The
/// count underneath says what was left out, so a missing code reads as "keep typing".
const RESULT_LIMIT = 60;

const POINTS: ReadonlyArray<{
  icon: typeof IconWallet;
  title: MessageKey;
  body: MessageKey;
}> = [
  { icon: IconWallet, title: 'newBudget.point1Title', body: 'newBudget.point1Body' },
  { icon: IconBuildingBank, title: 'newBudget.point2Title', body: 'newBudget.point2Body' },
  { icon: IconTrendingUp, title: 'newBudget.point3Title', body: 'newBudget.point3Body' },
];

function mintKey(): string {
  return crypto.randomUUID();
}

function browserTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/// The phone half of a field that opens a list. `Combobox` positions its own popup and cannot
/// be put inside a drawer, so the two widths are two compositions of the same primitives:
/// the combobox on a desktop, this drawer under a thumb.
function FieldDrawer({
  id,
  label,
  face,
  open,
  onOpenChange,
  children,
}: {
  id: string;
  label: string;
  face: ReactNode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
}) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerTrigger
        id={id}
        role="combobox"
        aria-label={label}
        aria-expanded={open}
        className={FIELD}
      >
        {face}
        <IconChevronDown className="text-muted-foreground size-4 shrink-0" />
      </DrawerTrigger>
      <DrawerContent className="max-h-[85svh]">
        <DrawerHeader>
          <DrawerTitle>{label}</DrawerTitle>
        </DrawerHeader>
        {children}
      </DrawerContent>
    </Drawer>
  );
}

export function NewBudgetForm({ nameIndex }: { nameIndex: number }) {
  const { t, locale, setLocale } = useTranslations();
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();

  const [name, setName] = useState('');
  const [currency, setCurrency] = useState('');
  const [withDefaultCategories, setWithDefaultCategories] = useState(true);
  const [languageOpen, setLanguageOpen] = useState(false);
  const [currencyOpen, setCurrencyOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [fading, setFading] = useState(false);
  const [created, setCreated] = useState<{ name: string; currency: string } | null>(null);

  // Minted when the form opens, not per click, or a double click writes two budgets. It is
  // minted again only when the user changes their mind after a failure: the same key carrying
  // a different intent is refused by the API, which would read as a bug from the outside.
  const [idempotencyKey, setIdempotencyKey] = useState(mintKey);
  const [failed, setFailed] = useState(false);

  const create = useMutation({
    ...budgetsControllerCreateMutation(),
    onSuccess: async () => {
      setCreated({ name: name.trim(), currency });
      await queryClient.invalidateQueries({ queryKey: budgetsControllerListQueryKey() });
    },
    onError: () => {
      setFailed(true);
    },
  });

  const options = useMemo(() => currencyOptions(locale), [locale]);
  const matched = useMemo(() => searchCurrencies(options, query), [options, query]);
  const results = matched.slice(0, RESULT_LIMIT);
  const chosen = options.find((option) => option.code === currency) ?? null;

  const countLabel =
    matched.length > RESULT_LIMIT
      ? t('newBudget.currencyCountLimited', { limit: RESULT_LIMIT, total: matched.length })
      : t('newBudget.currencyCount', { shown: matched.length, total: options.length });

  const edited = (): void => {
    if (!failed) return;

    setIdempotencyKey(mintKey());
    setFailed(false);
  };

  const chooseLocale = (next: Locale): void => {
    setLanguageOpen(false);
    if (next === locale) return;

    // The key and the locale change together, or a submit landing inside the fade window
    // could send a freshly minted key with the language `submit` hasn't caught up to yet.
    setFading(true);
    window.setTimeout(() => {
      setLocale(next);
      setQuery('');
      setFading(false);
      edited();
    }, FADE_MS);
  };

  const chooseCurrency = (code: string): void => {
    setCurrency(code);
    setCurrencyOpen(false);
    setQuery('');
    edited();
  };

  const submit = (event: FormEvent): void => {
    event.preventDefault();

    create.mutate({
      body: {
        language: locale,
        name: name.trim(),
        currency,
        timezone: browserTimeZone(),
        withDefaultCategories,
        idempotencyKey,
      },
    });
  };

  const points = (
    <ul className="flex flex-col gap-4">
      {POINTS.map((point) => (
        <li key={point.title} className="flex items-start gap-3">
          <span className="bg-secondary grid size-8 shrink-0 place-items-center rounded-lg">
            <point.icon className="size-4" />
          </span>
          <span className="flex flex-col gap-0.5">
            <span className="text-sm font-medium">{t(point.title)}</span>
            <span className="text-muted-foreground text-sm">{t(point.body)}</span>
          </span>
        </li>
      ))}
    </ul>
  );

  const currencyRow = (option: CurrencyOption): ReactNode => (
    <>
      <span className="w-11 shrink-0 font-medium">{option.code}</span>
      <span className="text-muted-foreground truncate">{option.name}</span>
    </>
  );

  const languageField = isMobile ? (
    <FieldDrawer
      id="budget-language"
      label={t('newBudget.languageLabel')}
      face={<span className="truncate">{localeLabels[locale]}</span>}
      open={languageOpen}
      onOpenChange={setLanguageOpen}
    >
      <Command label={t('newBudget.languageLabel')} className={SHEET}>
        <CommandList className="py-2">
          {locales.map((option) => (
            <CommandItem
              key={option}
              value={option}
              className={SHEET_ITEM}
              onSelect={() => {
                chooseLocale(option);
              }}
            >
              <IconCheck
                className={cn('size-4', option === locale ? 'opacity-100' : 'opacity-0')}
              />
              <span>{localeLabels[option]}</span>
            </CommandItem>
          ))}
        </CommandList>
      </Command>
    </FieldDrawer>
  ) : (
    <Select
      value={locale}
      onValueChange={(next: Locale | null) => {
        if (next !== null) chooseLocale(next);
      }}
      open={languageOpen}
      onOpenChange={setLanguageOpen}
    >
      <SelectTrigger
        id="budget-language"
        aria-label={t('newBudget.languageLabel')}
        className={cn('w-full', CONTROL)}
      >
        <SelectValue>{(option: Locale) => localeLabels[option]}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {locales.map((option) => (
          <SelectItem key={option} value={option}>
            {localeLabels[option]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  const currencyField = isMobile ? (
    <FieldDrawer
      id="budget-currency"
      label={t('newBudget.currencyLabel')}
      face={
        <span className={cn('truncate', chosen === null && 'text-muted-foreground')}>
          {chosen === null ? t('newBudget.currencyPlaceholder') : `${chosen.code} · ${chosen.name}`}
        </span>
      }
      open={currencyOpen}
      onOpenChange={setCurrencyOpen}
    >
      <Command shouldFilter={false} label={t('newBudget.searchPlaceholder')} className={SHEET}>
        <CommandInput
          placeholder={t('newBudget.searchPlaceholder')}
          value={query}
          onValueChange={setQuery}
        />
        <CommandList className="pt-2 pb-4">
          <CommandEmpty>{t('newBudget.nothingFound')}</CommandEmpty>
          {results.map((option) => (
            <CommandItem
              key={option.code}
              value={option.code}
              className={SHEET_ITEM}
              onSelect={() => {
                chooseCurrency(option.code);
              }}
            >
              <IconCheck
                className={cn('size-4', option.code === currency ? 'opacity-100' : 'opacity-0')}
              />
              {currencyRow(option)}
            </CommandItem>
          ))}
        </CommandList>
        <p className="text-muted-foreground border-t px-3 py-3 text-xs">{countLabel}</p>
      </Command>
    </FieldDrawer>
  ) : (
    <Combobox
      items={results}
      value={chosen}
      onValueChange={(next: CurrencyOption | null) => {
        if (next !== null) chooseCurrency(next.code);
      }}
      itemToStringLabel={(option: CurrencyOption) => `${option.code} · ${option.name}`}
      isItemEqualToValue={(left: CurrencyOption, right: CurrencyOption) => left.code === right.code}
      filter={null}
      inputValue={query}
      onInputValueChange={setQuery}
      open={currencyOpen}
      onOpenChange={setCurrencyOpen}
    >
      <ComboboxTrigger
        id="budget-currency"
        aria-label={t('newBudget.currencyLabel')}
        className={FIELD}
      >
        <ComboboxValue placeholder={t('newBudget.currencyPlaceholder')} />
      </ComboboxTrigger>
      <ComboboxContent align="start" sideOffset={-32} className={POPUP}>
        <ComboboxInput placeholder={t('newBudget.searchPlaceholder')} showTrigger={false} />
        <ComboboxEmpty>{t('newBudget.nothingFound')}</ComboboxEmpty>
        <ComboboxList>
          {results.map((option) => (
            <ComboboxItem key={option.code} value={option}>
              {currencyRow(option)}
            </ComboboxItem>
          ))}
        </ComboboxList>
        <p className="text-muted-foreground border-t px-3 py-2 text-xs">{countLabel}</p>
      </ComboboxContent>
    </Combobox>
  );

  return (
    <>
      <div className="absolute end-5 top-5 md:end-6 md:top-6">
        <ThemeToggle label={t('common.themeToggle.trigger')} />
      </div>

      <div
        className={cn(
          'grid gap-10 transition-opacity duration-150 md:grid-cols-2 md:items-center md:gap-16',
          fading ? 'opacity-0' : 'opacity-100',
        )}
      >
        <div className="flex flex-col gap-8">
          <div className="hidden items-center gap-2 md:flex">
            <span className="bg-primary text-primary-foreground grid size-8 place-items-center rounded-lg text-sm font-semibold">
              R
            </span>
            <span className="font-semibold">Rondo Money</span>
          </div>

          <div className="flex flex-col gap-3">
            <h1 className="text-[26px] font-semibold tracking-tight md:text-[34px]">
              {t('newBudget.heading')}
            </h1>
            <p className="text-muted-foreground text-sm">{t('newBudget.lead')}</p>
          </div>

          {isMobile ? null : points}
        </div>

        <Card className="max-md:rounded-none max-md:bg-transparent max-md:py-0 max-md:shadow-none max-md:ring-0">
          {created === null ? (
            <CardHeader className="max-md:hidden">
              <CardTitle>{t('newBudget.cardTitle')}</CardTitle>
              <CardDescription>{t('newBudget.cardDescription')}</CardDescription>
            </CardHeader>
          ) : null}

          <CardContent className="max-md:px-0">
            {created ? (
              <div className="flex flex-col gap-5">
                <div className="flex items-center gap-3.5">
                  <span className="bg-primary text-primary-foreground grid size-14 shrink-0 place-items-center rounded-full motion-safe:animate-in motion-safe:zoom-in-50 motion-safe:duration-300">
                    <IconCheck
                      strokeWidth={2.5}
                      className="size-7 [stroke-dasharray:30] motion-safe:animate-draw-check"
                    />
                  </span>
                  <div className="flex flex-col gap-0.5">
                    <p className="text-xl font-semibold tracking-tight">
                      {t('newBudget.doneTitle', { name: created.name })}
                    </p>
                    <p className="text-muted-foreground text-sm">
                      {withDefaultCategories
                        ? t('newBudget.doneWithDefaults')
                        : t('newBudget.doneWithoutDefaults')}
                    </p>
                  </div>
                </div>

                <div className="bg-secondary flex items-baseline justify-between gap-3 rounded-2xl px-4 py-3.5">
                  <span className="text-sm">{t('newBudget.doneCurrency')}</span>
                  <span className="text-end text-base font-semibold tracking-tight text-balance">
                    {currencyName(locale, created.currency)}
                  </span>
                </div>

                <Link
                  href="/new/account"
                  className={cn(buttonVariants(), CONTROL, 'max-md:w-full')}
                >
                  {t('newBudget.continue')}
                </Link>
              </div>
            ) : (
              <form onSubmit={submit} className="flex flex-col gap-6">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="budget-language">{t('newBudget.languageLabel')}</Label>
                  {languageField}
                  <p className="text-muted-foreground text-xs">{t('newBudget.languageHint')}</p>
                </div>

                <div className="flex flex-col gap-2">
                  <Label htmlFor="budget-name">{t('newBudget.nameLabel')}</Label>
                  <Input
                    id="budget-name"
                    value={name}
                    placeholder={t(namePlaceholderKey(nameIndex))}
                    maxLength={60}
                    onChange={(event) => {
                      setName(event.target.value);
                      edited();
                    }}
                    className={CONTROL}
                  />
                </div>

                <div className="flex flex-col gap-2">
                  <Label htmlFor="budget-currency">{t('newBudget.currencyLabel')}</Label>
                  {currencyField}
                  <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
                    <IconLock className="size-3.5 shrink-0" />
                    {t('newBudget.currencyLocked')}
                  </p>
                  {chosen === null ? null : (
                    <p className="text-sm font-medium">{sampleAmount(locale, chosen.code)}</p>
                  )}
                </div>

                <div className="flex items-start gap-3">
                  <Checkbox
                    id="budget-defaults"
                    checked={withDefaultCategories}
                    onCheckedChange={(next) => {
                      setWithDefaultCategories(next);
                      edited();
                    }}
                    className="mt-1"
                  />
                  <Label htmlFor="budget-defaults" className="flex flex-col items-start gap-1">
                    <span>{t('newBudget.defaultsLabel')}</span>
                    <span className="text-muted-foreground text-xs font-normal">
                      {withDefaultCategories
                        ? t('newBudget.defaultsOn')
                        : t('newBudget.defaultsOff')}
                    </span>
                  </Label>
                </div>

                {failed ? (
                  <p role="alert" className="text-destructive text-sm">
                    {t('newBudget.submitFailed')}
                  </p>
                ) : null}

                <Button
                  type="submit"
                  disabled={name.trim() === '' || currency === '' || create.isPending}
                  className={CONTROL}
                >
                  {create.isPending ? <IconLoader className="size-4 animate-spin" /> : null}
                  {create.isPending ? t('newBudget.submitting') : t('newBudget.submit')}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>

        {isMobile ? (
          <div className="flex flex-col gap-6">
            <Separator />
            {points}
          </div>
        ) : null}
      </div>
    </>
  );
}
