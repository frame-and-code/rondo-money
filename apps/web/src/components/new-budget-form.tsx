'use client';

import {
  budgetsControllerCreateMutation,
  budgetsControllerListOptions,
  budgetsControllerListQueryKey,
} from '@rondo/api-client/react-query';
import { ThemeToggle } from '@rondo/ui/components/theme-toggle';
import { Button, buttonVariants } from '@rondo/ui/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@rondo/ui/components/ui/card';
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
import { useIsMobile } from '@rondo/ui/hooks/use-mobile';
import { cn } from '@rondo/ui/lib/utils';
import { IconCheck, IconChevronDown, IconLoader, IconLock } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';

import { readAnotherBudget, useAdmittedState } from '@/components/onboarding-gate';
import { OnboardingSteps } from '@/components/onboarding-steps';
import { useTranslations } from '@/i18n/locale-context';
import { localeLabels, locales, type Locale } from '@/i18n/locales';
import { namePlaceholderKey } from '@/i18n/name-placeholders';
import { isNameTaken, isUnknownBudget } from '@/lib/budget-failure';
import {
  currencyName,
  currencyOptions,
  searchCurrencies,
  type CurrencyOption,
} from '@/lib/currencies';
import { BALANCES_ROUTE, onboardingRoute } from '@/lib/onboarding';
import { APP_MARK, APP_NAME } from '@/lib/sections';

const FADE_MS = 150;

const CONTROL = 'h-11 rounded-full px-3.5 text-sm md:h-8 md:rounded-2xl md:px-3';

const SHEET_SEARCH = '**:data-[slot=input-group]:h-11!';

const FIELD = cn(
  'bg-input/50 flex w-full items-center justify-between gap-2 border border-transparent text-start transition-colors',
  CONTROL,
);

const POPUP = 'min-w-(--anchor-width)';

const RESULT_LIMIT = 60;

function mintKey(): string {
  return crypto.randomUUID();
}

function templateAddress(id: string): string {
  return `${onboardingRoute('budget')}?from=${id}`;
}

function browserTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

function FieldDrawer({
  id,
  label,
  face,
  open,
  disabled = false,
  onOpenChange,
  children,
}: {
  id: string;
  label: string;
  face: ReactNode;
  open: boolean;
  disabled?: boolean;
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
        disabled={disabled}
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
  const { t, tn, locale, setLocale } = useTranslations();
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();
  const another = useAdmittedState() === 'app';

  const from = useSearchParams().get('from');
  const basedOn = another && from !== null;
  const { data: budgets } = useQuery({ ...budgetsControllerListOptions(), enabled: basedOn });
  const template = basedOn
    ? (budgets?.find((budget) => budget.id === from) ??
      budgets?.find((budget) => budget.active) ??
      null)
    : null;
  const templateId = template?.id ?? null;

  const [name, setName] = useState('');
  const [pickedCurrency, setPickedCurrency] = useState('');
  const currency = pickedCurrency === '' ? (template?.currency ?? '') : pickedCurrency;
  const [templateOpen, setTemplateOpen] = useState(false);
  const [withDefaultCategories, setWithDefaultCategories] = useState(!another);
  const [agreed, setAgreed] = useState(true);
  const [languageOpen, setLanguageOpen] = useState(false);
  const [currencyOpen, setCurrencyOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [fading, setFading] = useState(false);
  const [created, setCreated] = useState<{
    name: string;
    currency: string;
    copied: boolean;
  } | null>(null);

  const [idempotencyKey, setIdempotencyKey] = useState(mintKey);
  const [failed, setFailed] = useState(false);
  const [nameTaken, setNameTaken] = useState(false);

  const create = useMutation({
    ...budgetsControllerCreateMutation(),
    onSuccess: async (_answer, variables) => {
      setCreated({
        name: variables.body.name,
        currency: variables.body.currency,
        copied: variables.body.templateId !== undefined,
      });
      await (another
        ? readAnotherBudget(queryClient)
        : queryClient.invalidateQueries({ queryKey: budgetsControllerListQueryKey() }));
    },
    onError: (error) => {
      setFailed(true);
      setNameTaken(isNameTaken(error));
      if (isUnknownBudget(error)) {
        setAgreed(false);
        void queryClient.invalidateQueries({ queryKey: budgetsControllerListQueryKey() });
      }
    },
  });

  useEffect(() => {
    if (templateId !== null && templateId !== from) {
      window.history.replaceState(null, '', templateAddress(templateId));
    }
  }, [templateId, from]);

  const options = useMemo(() => currencyOptions(locale), [locale]);
  const matched = useMemo(() => searchCurrencies(options, query), [options, query]);
  const results = matched.slice(0, RESULT_LIMIT);
  const chosen = options.find((option) => option.code === currency) ?? null;

  const countLabel =
    matched.length > RESULT_LIMIT
      ? t('newBudget.currencyCountLimited', { limit: RESULT_LIMIT, total: matched.length })
      : tn('newBudget.currencyCount', options.length, {
          shown: matched.length,
          total: options.length,
        });

  const edited = (): void => {
    if (!failed) return;

    setIdempotencyKey(mintKey());
    setFailed(false);
  };

  const chooseLocale = (next: Locale): void => {
    setLanguageOpen(false);
    if (next === locale) return;

    setFading(true);
    window.setTimeout(() => {
      setLocale(next);
      setQuery('');
      setFading(false);
      edited();
    }, FADE_MS);
  };

  const chooseTemplate = (id: string): void => {
    setTemplateOpen(false);
    if (id === templateId) return;

    window.history.replaceState(null, '', templateAddress(id));
    edited();
  };

  const chooseCurrency = (code: string): void => {
    setPickedCurrency(code);
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
        withDefaultCategories: basedOn ? false : withDefaultCategories,
        ...(templateId === null ? {} : { templateId }),
        idempotencyKey,
      },
    });
  };

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
      <Command value={locale} label={t('newBudget.languageLabel')}>
        <CommandList className="py-2">
          {locales.map((option) => (
            <CommandItem
              key={option}
              value={option}
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

  const templateField =
    template === null || budgets === undefined ? null : isMobile ? (
      <FieldDrawer
        id="budget-template"
        label={t('newBudget.templateLabel')}
        face={<span className="truncate">{template.name}</span>}
        open={templateOpen}
        disabled={create.isPending}
        onOpenChange={setTemplateOpen}
      >
        <Command value={template.id} label={t('newBudget.templateLabel')}>
          <CommandList className="py-2">
            {budgets.map((budget) => (
              <CommandItem
                key={budget.id}
                value={budget.id}
                keywords={[budget.name]}
                onSelect={() => {
                  chooseTemplate(budget.id);
                }}
              >
                <IconCheck
                  className={cn('size-4', budget.id === template.id ? 'opacity-100' : 'opacity-0')}
                />
                <span className="truncate">{budget.name}</span>
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </FieldDrawer>
    ) : (
      <Select
        value={template.id}
        disabled={create.isPending}
        onValueChange={(next: string | null) => {
          if (next !== null) chooseTemplate(next);
        }}
        open={templateOpen}
        onOpenChange={setTemplateOpen}
      >
        <SelectTrigger
          id="budget-template"
          aria-label={t('newBudget.templateLabel')}
          className={cn('w-full', CONTROL)}
        >
          <SelectValue>
            {(id: string) => budgets.find((budget) => budget.id === id)?.name ?? ''}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {budgets.map((budget) => (
            <SelectItem key={budget.id} value={budget.id}>
              {budget.name}
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
      <Command
        value={currency}
        shouldFilter={false}
        label={t('newBudget.searchPlaceholder')}
        className={SHEET_SEARCH}
      >
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
      <div className="flex justify-end max-md:mb-6 md:absolute md:end-6 md:top-6">
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
              {APP_MARK}
            </span>
            <span className="font-semibold">{APP_NAME}</span>
          </div>

          <div className="flex flex-col gap-3">
            <h1 className="text-[26px] font-semibold tracking-tight md:text-[34px]">
              {t('newBudget.heading')}
            </h1>
            <p className="text-muted-foreground text-sm">
              {t(
                basedOn
                  ? 'newBudget.templateLead'
                  : another
                    ? 'newBudget.secondLead'
                    : 'newBudget.lead',
              )}
            </p>
          </div>

          <OnboardingSteps
            done={created === null ? 0 : 1}
            variant={basedOn ? 'copy' : another ? 'another' : 'first'}
          />
        </div>

        <Card className="max-md:rounded-none max-md:bg-transparent max-md:py-0 max-md:shadow-none max-md:ring-0">
          {created === null ? (
            <CardHeader className="max-md:hidden">
              <CardTitle>{t('newBudget.cardTitle')}</CardTitle>
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
                      {t(
                        created.copied
                          ? 'newBudget.doneFromTemplate'
                          : withDefaultCategories
                            ? 'newBudget.doneWithDefaults'
                            : 'newBudget.doneWithoutDefaults',
                      )}
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
                  href={created.copied ? BALANCES_ROUTE : onboardingRoute('account')}
                  className={cn(buttonVariants(), CONTROL, 'max-md:w-full')}
                >
                  {t(created.copied ? 'newBudget.balances' : 'newBudget.continue')}
                </Link>
              </div>
            ) : (
              <form onSubmit={submit} className="flex flex-col gap-6">
                {another ? null : (
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="budget-language">{t('newBudget.languageLabel')}</Label>
                    {languageField}
                    <p className="text-muted-foreground text-xs">{t('newBudget.languageHint')}</p>
                  </div>
                )}

                {templateField === null ? null : (
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="budget-template">{t('newBudget.templateLabel')}</Label>
                    {templateField}
                  </div>
                )}

                <div className="flex flex-col gap-2">
                  <Label htmlFor="budget-name">{t('newBudget.nameLabel')}</Label>
                  <Input
                    id="budget-name"
                    value={name}
                    placeholder={t(namePlaceholderKey(nameIndex))}
                    maxLength={60}
                    onChange={(event) => {
                      setName(event.target.value);
                      setNameTaken(false);
                      edited();
                    }}
                    className={CONTROL}
                  />
                  {nameTaken ? (
                    <p role="alert" className="text-destructive text-xs">
                      {t('newBudget.nameTaken')}
                    </p>
                  ) : null}
                </div>

                <div className="flex flex-col gap-2">
                  <Label htmlFor="budget-currency">{t('newBudget.currencyLabel')}</Label>
                  {currencyField}
                  <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
                    <IconLock className="size-3.5 shrink-0" />
                    {t('newBudget.currencyLocked')}
                  </p>
                  {template !== null && currency !== template.currency ? (
                    <p className="text-muted-foreground text-xs">
                      {t('newBudget.templateGoalsStay')}
                    </p>
                  ) : null}
                </div>

                {basedOn ? null : (
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
                )}

                {another ? (
                  <div className="flex items-start gap-3">
                    <Checkbox
                      id="budget-consent"
                      checked={agreed}
                      onCheckedChange={(next) => {
                        setAgreed(next);
                        edited();
                      }}
                      className="mt-1"
                    />
                    <div className="flex flex-col items-start gap-1.5">
                      <Label htmlFor="budget-consent">{t('newBudget.consentLabel')}</Label>
                      <div className="text-muted-foreground flex flex-col text-xs">
                        <p>{t('newBudget.consentHint')}</p>
                        {basedOn ? <p>{t('newBudget.templateConsentHint')}</p> : null}
                      </div>
                    </div>
                  </div>
                ) : null}

                {failed && !nameTaken ? (
                  <p role="alert" className="text-destructive text-sm">
                    {t('newBudget.submitFailed')}
                  </p>
                ) : null}

                <Button
                  type="submit"
                  disabled={
                    name.trim() === '' ||
                    currency === '' ||
                    (another && !agreed) ||
                    (basedOn && templateId === null) ||
                    create.isPending
                  }
                  className={CONTROL}
                >
                  {create.isPending ? <IconLoader className="size-4 animate-spin" /> : null}
                  {create.isPending ? t('newBudget.submitting') : t('newBudget.submit')}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
