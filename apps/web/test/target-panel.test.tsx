import type { BudgetViewTargetDto, TargetKind } from '@rondo/types';
import { cleanup, render, screen, within } from '@testing-library/react';

import { TargetPanel } from '@/components/target-panel';
import { LocaleProvider } from '@/i18n/locale-context';
import { en } from '@/i18n/messages/en';
import { moneyOf } from '@/lib/money';

const goal = (
  kind: TargetKind,
  parts: { amount: number; progress: number; monthTarget?: number; needed?: number },
): BudgetViewTargetDto => ({
  kind,
  amount: String(parts.amount),
  startMonth: '2026-07',
  progress: String(parts.progress),
  remaining: String(Math.max(0, parts.amount - parts.progress)),
  ...(kind === 'BY_DATE' ? { dueMonth: '2026-10' as const } : {}),
  ...(parts.monthTarget === undefined ? {} : { monthTarget: String(parts.monthTarget) }),
  ...(parts.needed === undefined ? {} : { needed: String(parts.needed) }),
});

const draw = (target: BudgetViewTargetDto) =>
  render(
    <LocaleProvider>
      <TargetPanel
        target={target}
        money={moneyOf('ru-RU', 'PLN', 2, { signed: true })}
        color="cyan"
      />
    </LocaleProvider>,
  );

afterEach(cleanup);

describe('the panel that explains a goal', () => {
  it('reads the whole goal for a deadline, so the card can keep only the month', () => {
    draw(goal('BY_DATE', { amount: 100000, progress: 40000, monthTarget: 26666, needed: 6666 }));

    const panel = screen.getByTestId('target-panel');

    expect(panel).toHaveTextContent(en['categories.goalByDate']);
    expect(panel).toHaveTextContent(en['categories.goalTargetLine']);
    expect(panel).toHaveTextContent(en['categories.goalDeadline']);
    expect(panel).toHaveTextContent('October 2026');
    expect(panel).toHaveTextContent('400');
    expect(panel).toHaveTextContent('1 000');
    expect(panel).toHaveTextContent(en['categories.goalLeft'].replace('{{amount}}', '600 zł'));
    expect(panel).toHaveTextContent('66,66');
  });

  it('reads the whole goal for the two kinds that only ever ask for a month', () => {
    for (const kind of ['REFILL_TO', 'CONTRIBUTE'] as const) {
      draw(goal(kind, { amount: 30000, progress: 20000, monthTarget: 30000, needed: 10000 }));

      const panel = screen.getByTestId('target-panel');

      expect(panel).toHaveTextContent('200');
      expect(panel).toHaveTextContent('300');
      expect(panel).toHaveTextContent(en['categories.goalLeft'].replace('{{amount}}', '100 zł'));
      cleanup();
    }
  });

  it('leaves out the month of a goal that never asks for one, and says it has no deadline', () => {
    draw(goal('ACCUMULATE', { amount: 50000, progress: 12000 }));

    const panel = screen.getByTestId('target-panel');

    expect(panel).toHaveTextContent(en['categories.goalAccumulate']);
    expect(panel).not.toHaveTextContent(en['categories.goalDeadline']);
    expect(panel).not.toHaveTextContent(en['categories.goalAssignThisMonth']);
    expect(panel).not.toHaveTextContent(en['categories.goalStillToAssign']);
    expect(panel).toHaveTextContent('120');
  });

  it('drops the shortfall line once the month is covered, and ticks the pair instead', () => {
    draw(goal('CONTRIBUTE', { amount: 40000, progress: 40000, monthTarget: 40000, needed: 0 }));

    const panel = screen.getByTestId('target-panel');

    expect(panel).not.toHaveTextContent(en['categories.goalStillToAssign']);
    expect(
      within(panel).getByText(en['categories.goalAssignThisMonth']).parentElement,
    ).toHaveTextContent('400 / 400');
    expect(
      within(panel)
        .getByText(en['categories.goalAssignThisMonth'])
        .parentElement?.querySelector('[data-state="covered"]'),
    ).not.toBeNull();
  });

  it('marks the month short beside the amount that is still missing', () => {
    draw(goal('CONTRIBUTE', { amount: 40000, progress: 20000, monthTarget: 40000, needed: 20000 }));

    const panel = screen.getByTestId('target-panel');

    const pair = within(panel).getByText(en['categories.goalAssignThisMonth']).parentElement;

    expect(panel).toHaveTextContent(en['categories.goalStillToAssign']);
    expect(pair?.querySelector('[data-state="short"]')).not.toBeNull();
    expect(
      within(panel)
        .getByText(en['categories.goalStillToAssign'])
        .parentElement?.querySelector('[data-state]'),
    ).toBeNull();
  });

  it('reds the month that went below nothing, the same as the whole-goal number', () => {
    draw(goal('CONTRIBUTE', { amount: 30000, progress: -5000, monthTarget: 30000, needed: 35000 }));

    const panel = screen.getByTestId('target-panel');
    const pair = within(panel).getByText(en['categories.goalAssignThisMonth']).parentElement;

    expect(within(pair as HTMLElement).getByText('-50')).toHaveClass('text-destructive');
  });

  it('reds a goal the envelope was raided out of, the way any negative money is red', () => {
    draw(goal('ACCUMULATE', { amount: 50000, progress: -5200 }));

    expect(screen.getByTestId('target-progress')).toHaveClass('text-destructive');
  });

  it('draws the whole-goal bar in the colour the category itself wears', () => {
    draw(goal('ACCUMULATE', { amount: 50000, progress: 12000 }));

    const track = screen.getByTestId('target-panel').querySelector('.rounded-full');

    expect(track?.getAttribute('style')).toContain('--cat-cyan');
    expect(track?.getAttribute('style')).toContain('--track-alpha');
    expect(track?.firstElementChild?.getAttribute('style')).toContain('--cat-cyan');
  });
});
