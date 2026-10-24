'use client';

import { useIsMobile } from '@rondo/ui/hooks/use-mobile';
import { cn } from '@rondo/ui/lib/utils';
import { IconCheck } from '@tabler/icons-react';
import { Fragment } from 'react';

import { useTranslations } from '@/i18n/locale-context';
import type { MessageKey } from '@/i18n/messages';

export type OnboardingVariant = 'first' | 'another' | 'copy';

const BODIES: Record<OnboardingVariant, readonly [MessageKey, MessageKey, MessageKey]> = {
  first: ['onboarding.step1Body', 'onboarding.step2Body', 'onboarding.step3Body'],
  another: ['onboarding.step1BodyAnother', 'onboarding.step2Body', 'onboarding.step3Body'],
  copy: ['onboarding.step1BodyCopy', 'onboarding.step2BodyCopy', 'onboarding.step3Body'],
};

const TITLES: readonly [MessageKey, MessageKey, MessageKey] = [
  'onboarding.step1Title',
  'onboarding.step2Title',
  'onboarding.step3Title',
];

function stepsOf(variant: OnboardingVariant): { title: MessageKey; body: MessageKey }[] {
  return TITLES.map((title, index) => ({ title, body: BODIES[variant][index] ?? title }));
}

export function OnboardingSteps({
  done,
  variant = 'first',
}: {
  done: number;
  variant?: OnboardingVariant;
}) {
  const steps = stepsOf(variant);
  const { t } = useTranslations();
  const isMobile = useIsMobile();
  const current = Math.min(done, steps.length - 1);

  const eyebrow = (
    <p className="text-muted-foreground text-[11px] font-semibold tracking-[0.08em] uppercase">
      {t('onboarding.progress', { step: current + 1 })}
    </p>
  );

  if (isMobile) {
    return <OnboardingRow steps={steps} done={done} current={current} eyebrow={eyebrow} />;
  }

  return (
    <div className="flex flex-col gap-3">
      {eyebrow}

      <ol className="flex flex-col gap-[18px]">
        {steps.map((step, index) => (
          <li key={step.title} className="relative flex items-start gap-3">
            {index < steps.length - 1 ? (
              <span
                className="bg-border absolute top-7 -bottom-[18px] left-[11px] w-0.5"
                aria-hidden
              />
            ) : null}

            {index < done ? (
              <span className="bg-primary text-primary-foreground grid size-6 shrink-0 place-items-center rounded-full">
                <IconCheck className="size-3.5" strokeWidth={3} />
              </span>
            ) : (
              <span
                className={cn(
                  'size-6 shrink-0 rounded-full border-2',
                  index === current ? 'border-primary grid place-items-center' : 'border-border',
                )}
              >
                {index === current ? <span className="bg-primary size-2 rounded-full" /> : null}
              </span>
            )}

            <span className="flex flex-col gap-0.5">
              <span
                className={cn(
                  'text-sm',
                  index === current ? 'font-semibold' : 'text-muted-foreground font-medium',
                )}
              >
                {t(step.title)}
              </span>
              <span className="text-muted-foreground text-sm">{t(step.body)}</span>
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function OnboardingRow({
  steps,
  done,
  current,
  eyebrow,
}: {
  steps: readonly { title: MessageKey; body: MessageKey }[];
  done: number;
  current: number;
  eyebrow: React.ReactNode;
}) {
  const { t } = useTranslations();
  const step = steps[current];

  return (
    <div className="flex flex-col gap-2">
      {eyebrow}
      <p className="text-sm font-semibold">{step === undefined ? null : t(step.title)}</p>

      <div className="flex items-center py-1" aria-hidden>
        {steps.map((entry, index) => (
          <Fragment key={entry.title}>
            {index > 0 ? (
              <span
                className={cn(
                  'h-0.5 flex-1 rounded-full',
                  index <= done ? 'bg-primary' : 'bg-border',
                )}
              />
            ) : null}

            {index < done ? (
              <span className="bg-primary text-primary-foreground grid size-5 shrink-0 place-items-center rounded-full">
                <IconCheck className="size-3" strokeWidth={3} />
              </span>
            ) : (
              <span
                className={cn(
                  'size-3 shrink-0 rounded-full',
                  index === current
                    ? 'bg-primary ring-primary/20 ring-4'
                    : 'border-border border-2',
                )}
              />
            )}
          </Fragment>
        ))}
      </div>

      <p className="text-muted-foreground text-sm">{step === undefined ? null : t(step.body)}</p>
    </div>
  );
}
