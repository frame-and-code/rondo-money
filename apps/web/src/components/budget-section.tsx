'use client';

import {
  budgetsControllerActivateMutation,
  budgetsControllerListOptions,
  budgetsControllerListQueryKey,
  budgetsControllerRenameMutation,
} from '@rondo/api-client/react-query';
import { Alert, AlertDescription, AlertTitle } from '@rondo/ui/components/ui/alert';
import { Badge } from '@rondo/ui/components/ui/badge';
import { Button } from '@rondo/ui/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@rondo/ui/components/ui/dialog';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@rondo/ui/components/ui/drawer';
import { Input } from '@rondo/ui/components/ui/input';
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from '@rondo/ui/components/ui/item';
import { Label } from '@rondo/ui/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@rondo/ui/components/ui/radio-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@rondo/ui/components/ui/select';
import { Tooltip, TooltipContent, TooltipTrigger } from '@rondo/ui/components/ui/tooltip';
import { useIsMobile } from '@rondo/ui/hooks/use-mobile';
import { cn } from '@rondo/ui/lib/utils';
import { IconAlertCircle } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { useState, type FormEvent } from 'react';

import { NewBudgetDialog } from '@/components/new-budget-dialog';
import { readAnotherBudget } from '@/components/onboarding-gate';
import { SettingsSection } from '@/components/settings-section';
import { SwitchBudgetDialog } from '@/components/switch-budget-dialog';
import { useTranslations } from '@/i18n/locale-context';
import { isNameTaken } from '@/lib/budget-failure';
import { dayOf } from '@/lib/calendar-day';
import { currencyName } from '@/lib/currencies';
import { keepsTheKey, saveFailureKind } from '@/lib/save-failure';

interface Asking {
  id: string;
  name: string;
  key: string;
}

function mintKey(): string {
  return crypto.randomUUID();
}

export function BudgetSection() {
  const { t, locale } = useTranslations();
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();

  const { data: budgets } = useQuery(budgetsControllerListOptions());
  const rename = useMutation(budgetsControllerRenameMutation());
  const activate = useMutation({
    ...budgetsControllerActivateMutation(),
    onSuccess: () => readAnotherBudget(queryClient),
  });

  const [draft, setDraft] = useState<string | null>(null);
  const [renameKey, setRenameKey] = useState(mintKey);
  const [renameFailed, setRenameFailed] = useState(false);
  const [renameTaken, setRenameTaken] = useState(false);
  const [asking, setAsking] = useState<Asking | null>(null);
  const [askingOpen, setAskingOpen] = useState(false);
  const [switchFailed, setSwitchFailed] = useState(false);
  const [startingOpen, setStartingOpen] = useState(false);

  const active = budgets?.find((budget) => budget.active);
  if (budgets === undefined || active === undefined) {
    return null;
  }

  const name = draft ?? active.name;
  const wanted = name.trim();
  const busy = rename.isPending || activate.isPending;

  const typed = (next: string): void => {
    setDraft(next);
    setRenameTaken(false);
    if (!renameFailed) return;

    setRenameFailed(false);
    setRenameKey(mintKey());
  };

  const saveName = (event: FormEvent): void => {
    event.preventDefault();
    setRenameFailed(false);

    rename.mutate(
      { path: { id: active.id }, body: { name: wanted, idempotencyKey: renameKey } },
      {
        onSuccess: () => {
          setRenameKey(mintKey());
          void queryClient
            .invalidateQueries({ queryKey: budgetsControllerListQueryKey() })
            .then(() => {
              setDraft((now) => (now?.trim() === wanted ? null : now));
            });
        },
        onError: (error: unknown) => {
          setRenameFailed(true);
          setRenameTaken(isNameTaken(error));
          if (!keepsTheKey(saveFailureKind(error))) {
            setRenameKey(mintKey());
          }
        },
      },
    );
  };

  const ask = (id: string, called: string): void => {
    setSwitchFailed(false);
    setAsking({ id, name: called, key: mintKey() });
    setAskingOpen(true);
  };

  const closeAsking = (): void => {
    if (activate.isPending) return;

    setAskingOpen(false);
    setSwitchFailed(false);
  };

  const makeActive = (): void => {
    if (asking === null) return;

    setSwitchFailed(false);

    activate.mutate(
      { path: { id: asking.id }, body: { idempotencyKey: asking.key } },
      {
        onSuccess: () => {
          setAskingOpen(false);
          setDraft(null);
          setRenameFailed(false);
        },
        onError: (error: unknown) => {
          setSwitchFailed(true);
          if (!keepsTheKey(saveFailureKind(error))) {
            setAsking({ ...asking, key: mintKey() });
          }
        },
      },
    );
  };

  const question =
    asking === null ? null : (
      <SwitchBudgetDialog
        name={asking.name}
        failed={switchFailed}
        busy={activate.isPending}
        onConfirm={makeActive}
        onCancel={closeAsking}
      />
    );

  return (
    <SettingsSection title={t('settings.budget')} note={t('settings.budgetNote')}>
      {renameFailed && !renameTaken ? (
        <Alert variant="destructive">
          <IconAlertCircle />
          <AlertTitle>{t('settings.budgetFailedTitle')}</AlertTitle>
          <AlertDescription>{t('settings.budgetFailed')}</AlertDescription>
        </Alert>
      ) : null}

      <form onSubmit={saveName} className="flex flex-col gap-2">
        <Label htmlFor="settings-budget-name">{t('settings.budgetName')}</Label>
        <div className="flex gap-2">
          <Input
            id="settings-budget-name"
            value={name}
            maxLength={60}
            disabled={activate.isPending}
            onChange={(event) => {
              typed(event.target.value);
            }}
          />
          <Button
            type="submit"
            className="rounded-2xl"
            disabled={wanted === '' || wanted === active.name || busy}
          >
            {t('settings.budgetSave')}
          </Button>
        </div>
        {renameTaken ? (
          <p role="alert" className="text-destructive text-xs">
            {t('settings.budgetNameTaken')}
          </p>
        ) : null}
      </form>

      <div className="flex flex-col gap-2">
        <Label htmlFor="settings-budget-currency">{t('settings.budgetCurrency')}</Label>
        <Select value={active.currency} disabled>
          <SelectTrigger
            id="settings-budget-currency"
            aria-label={t('settings.budgetCurrency')}
            className="w-full"
          >
            <SelectValue>{(code: string) => `${code} · ${currencyName(locale, code)}`}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={active.currency}>{active.currency}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-2">
        <span id="settings-budgets-title" className="text-sm font-medium">
          {t('settings.budgets')}
        </span>
        <RadioGroup
          value={active.id}
          aria-labelledby="settings-budgets-title"
          onValueChange={(picked: unknown) => {
            const chosen = budgets.find((budget) => budget.id === picked);
            if (chosen !== undefined && !chosen.active) ask(chosen.id, chosen.name);
          }}
        >
          <ItemGroup aria-labelledby="settings-budgets-title" className="gap-2">
            {budgets.map((budget) => (
              <Item
                key={budget.id}
                role="listitem"
                data-testid="budget-row"
                variant="outline"
                size="sm"
                className={cn(
                  !budget.active && !busy && 'hover:border-ring hover:bg-muted/50 cursor-pointer',
                )}
                onClick={(event) => {
                  const onTheMark =
                    event.target instanceof Element &&
                    event.target.closest('[data-slot=radio-group-item]') !== null;

                  if (!onTheMark && !budget.active && !busy) ask(budget.id, budget.name);
                }}
              >
                <ItemMedia>
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <RadioGroupItem
                          value={budget.id}
                          disabled={busy && !budget.active}
                          aria-label={t(
                            budget.active
                              ? 'settings.budgetActiveNamed'
                              : 'settings.budgetActivateNamed',
                            { name: budget.name },
                          )}
                        />
                      }
                    />
                    <TooltipContent>
                      {t(budget.active ? 'settings.budgetActive' : 'settings.budgetActivate')}
                    </TooltipContent>
                  </Tooltip>
                </ItemMedia>
                <ItemContent>
                  <ItemTitle data-testid="budget-row-name">{budget.name}</ItemTitle>
                  <ItemDescription data-testid="budget-row-created">
                    {format(dayOf(budget.createdOn), 'dd.MM.yyyy')}
                  </ItemDescription>
                </ItemContent>
                <ItemActions>
                  <Badge variant="outline">{budget.currency}</Badge>
                  {budget.active ? (
                    <Badge variant="secondary">{t('settings.budgetActive')}</Badge>
                  ) : null}
                </ItemActions>
              </Item>
            ))}
          </ItemGroup>
        </RadioGroup>
      </div>

      <Button
        type="button"
        className="self-end rounded-2xl"
        disabled={busy}
        onClick={() => {
          setStartingOpen(true);
        }}
      >
        {t('settings.budgetNew')}
      </Button>

      {isMobile ? (
        <Drawer showSwipeHandle open={startingOpen} onOpenChange={setStartingOpen}>
          <DrawerContent className="max-h-[92dvh]">
            <DrawerHeader className="pb-0">
              <DrawerTitle className="sr-only">{t('settings.budget')}</DrawerTitle>
            </DrawerHeader>
            <div className="overflow-y-auto px-4 pb-6">
              <NewBudgetDialog activeId={active.id} />
            </div>
          </DrawerContent>
        </Drawer>
      ) : (
        <Dialog open={startingOpen} onOpenChange={setStartingOpen}>
          <DialogContent
            closeLabel={t('common.close')}
            className="gap-0 rounded-[24px] p-6 sm:max-w-[480px]"
          >
            <DialogTitle className="sr-only">{t('settings.budget')}</DialogTitle>
            <DialogDescription className="sr-only">{t('settings.budgetNote')}</DialogDescription>
            <NewBudgetDialog activeId={active.id} />
          </DialogContent>
        </Dialog>
      )}

      {isMobile ? (
        <Drawer
          showSwipeHandle
          open={askingOpen}
          onOpenChange={(next: boolean) => (next ? null : closeAsking())}
        >
          <DrawerContent className="max-h-[92dvh]">
            <DrawerHeader className="pb-0">
              <DrawerTitle className="sr-only">{t('settings.budgets')}</DrawerTitle>
            </DrawerHeader>
            <div className="overflow-y-auto px-4 pb-6">{question}</div>
          </DrawerContent>
        </Drawer>
      ) : (
        <Dialog open={askingOpen} onOpenChange={(next: boolean) => (next ? null : closeAsking())}>
          <DialogContent
            closeLabel={activate.isPending ? undefined : t('common.close')}
            className="gap-0 rounded-[24px] p-6 sm:max-w-[480px]"
          >
            <DialogTitle className="sr-only">{t('settings.budgets')}</DialogTitle>
            <DialogDescription className="sr-only">{t('settings.budgetNote')}</DialogDescription>
            {question}
          </DialogContent>
        </Dialog>
      )}
    </SettingsSection>
  );
}
