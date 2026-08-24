'use client';

import { useIsMobile } from '@rondo/ui/hooks/use-mobile';
import { cn } from '@rondo/ui/lib/utils';
import { IconCheck } from '@tabler/icons-react';
import { Fragment } from 'react';

import { useTranslations } from '@/i18n/locale-context';
import type { MessageKey } from '@/i18n/messages';

const STEPS: ReadonlyArray<{ title: MessageKey; body: MessageKey }> = [
  { title: 'onboarding.step1Title', body: 'onboarding.step1Body' },
  { title: 'onboarding.step2Title', body: 'onboarding.step2Body' },
  { title: 'onboarding.step3Title', body: 'onboarding.step3Body' },
];

/// The last step is done in the app rather than in the wizard, so it is never `done` here. It
/// is listed anyway: setup is not over when the wizard closes, and a list that stopped at the
/// account would say it was.
export function OnboardingSteps({ done }: { done: number }) {
  const { t } = useTranslations();
  const isMobile = useIsMobile();
  const current = Math.min(done, STEPS.length - 1);

  const eyebrow = (
    <p className="text-muted-foreground text-[11px] font-semibold tracking-[0.08em] uppercase">
      {t('onboarding.progress', { step: current + 1 })}
    </p>
  );

  if (isMobile) {
    return <OnboardingRow done={done} current={current} eyebrow={eyebrow} />;
  }

  return (
    <div className="flex flex-col gap-3">
      {eyebrow}

      <ol className="flex flex-col gap-[18px]">
        {STEPS.map((step, index) => (
          <li key={step.title} className="relative flex items-start gap-3">
            {index < STEPS.length - 1 ? (
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

/// The phone has no room for three explanations at once, so the row carries the one the user
/// is on. The dots are an indicator and nothing else: the eyebrow above already says which
/// step this is in words, which is what a screen reader needs.
function OnboardingRow({
  done,
  current,
  eyebrow,
}: {
  done: number;
  current: number;
  eyebrow: React.ReactNode;
}) {
  const { t } = useTranslations();
  const step = STEPS[current];

  return (
    <div className="flex flex-col gap-2">
      {eyebrow}
      <p className="text-sm font-semibold">{step === undefined ? null : t(step.title)}</p>

      <div className="flex items-center py-1" aria-hidden>
        {STEPS.map((entry, index) => (
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
