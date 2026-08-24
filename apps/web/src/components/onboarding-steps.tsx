import { IconCheck } from '@tabler/icons-react';

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
  const current = Math.min(done, STEPS.length - 1);

  return (
    <div className="flex flex-col gap-3">
      <p className="text-muted-foreground text-[11px] font-semibold tracking-[0.08em] uppercase">
        {t('onboarding.progress', { step: current + 1 })}
      </p>

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
                className={
                  index === current
                    ? 'border-primary grid size-6 shrink-0 place-items-center rounded-full border-2'
                    : 'border-border size-6 shrink-0 rounded-full border-2'
                }
              >
                {index === current ? <span className="bg-primary size-2 rounded-full" /> : null}
              </span>
            )}

            <span className="flex flex-col gap-0.5">
              <span
                className={
                  index === current
                    ? 'text-sm font-semibold'
                    : 'text-muted-foreground text-sm font-medium'
                }
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
