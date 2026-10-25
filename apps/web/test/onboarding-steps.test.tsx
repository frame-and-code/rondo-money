import { render, screen } from '@testing-library/react';

import { OnboardingSteps } from '@/components/onboarding-steps';
import { interpolate, LocaleProvider } from '@/i18n/locale-context';
import { ru } from '@/i18n/messages/ru';

const draw = (done: number, variant?: 'first' | 'another' | 'copy') => {
  Object.defineProperty(window.navigator, 'languages', {
    value: ['ru-RU'],
    configurable: true,
  });

  return render(
    <LocaleProvider>
      <OnboardingSteps done={done} variant={variant} />
    </LocaleProvider>,
  );
};

const step = (title: string) => screen.getByText(title).closest('li');

describe('the onboarding progress', () => {
  it('lists every step of setting up, including the one the wizard does not do', () => {
    draw(1);

    for (const title of ['step1Title', 'step2Title', 'step3Title'] as const) {
      expect(screen.getByText(ru[`onboarding.${title}`])).toBeInTheDocument();
    }
    expect(screen.getByText(ru['onboarding.step3Body'])).toBeInTheDocument();
  });

  it('counts the step the user is on, not the ones behind them', () => {
    const first = draw(0);
    expect(screen.getByText(interpolate(ru['onboarding.progress'], { step: 1 }))).toBeVisible();
    first.unmount();

    draw(2);
    expect(screen.getByText(interpolate(ru['onboarding.progress'], { step: 3 }))).toBeVisible();
  });

  it('marks what is behind with a tick and leaves the rest without one', () => {
    draw(1);

    expect(step(ru['onboarding.step1Title'])?.querySelector('svg')).not.toBeNull();
    expect(step(ru['onboarding.step2Title'])?.querySelector('svg')).toBeNull();
    expect(step(ru['onboarding.step3Title'])?.querySelector('svg')).toBeNull();
  });

  it('never counts past the last step, which the wizard does not finish', () => {
    draw(3);

    expect(screen.getByText(interpolate(ru['onboarding.progress'], { step: 3 }))).toBeVisible();
  });

  it.each([
    ['first', 'onboarding.step1Body', 'onboarding.step2Body'],
    ['another', 'onboarding.step1BodyAnother', 'onboarding.step2Body'],
    ['copy', 'onboarding.step1BodyCopy', 'onboarding.step2BodyCopy'],
  ] as const)('describes the steps of a %s budget in its own words', (variant, first, second) => {
    draw(0, variant);

    expect(screen.getByText(ru[first])).toBeInTheDocument();
    expect(screen.getByText(ru[second])).toBeInTheDocument();
    expect(screen.getByText(ru['onboarding.step3Body'])).toBeInTheDocument();
  });

  it('describes a first budget when told nothing else', () => {
    draw(0);

    expect(screen.getByText(ru['onboarding.step1Body'])).toBeInTheDocument();
  });
});
