'use client';

import { Tooltip, TooltipContent, TooltipTrigger } from '@rondo/ui/components/ui/tooltip';
import { cn } from '@rondo/ui/lib/utils';
import { IconCheck, IconExclamationMark } from '@tabler/icons-react';

import { useTranslations } from '@/i18n/locale-context';
import type { MoneyReader } from '@/lib/money';

import type { ComponentProps } from 'react';

const DELAY_MS = 300;

export function TargetMark({ covered, ...rest }: { covered: boolean } & ComponentProps<'span'>) {
  return (
    <span
      data-state={covered ? 'covered' : 'short'}
      className={cn(
        'me-1.5 inline-flex size-4 shrink-0 items-center justify-center rounded-full',
        'border-[1.5px] border-current',
        covered ? 'text-success' : 'text-warning',
      )}
      {...rest}
    >
      {covered ? (
        <IconCheck aria-hidden className="size-2.5" stroke={3.5} />
      ) : (
        <IconExclamationMark aria-hidden className="size-2.5" stroke={3.5} />
      )}
    </span>
  );
}

export function TargetBadge({ needed, money }: { needed: bigint; money: MoneyReader }) {
  const { t } = useTranslations();
  const covered = needed === 0n;

  return (
    <Tooltip>
      <TooltipTrigger
        delay={DELAY_MS}
        render={<TargetMark covered={covered} />}
        data-testid="target-badge"
      />
      <TooltipContent>
        {covered
          ? t('categories.goalCoveredTip')
          : t('categories.goalShortfallTip', { amount: money.format(needed) })}
      </TooltipContent>
    </Tooltip>
  );
}
