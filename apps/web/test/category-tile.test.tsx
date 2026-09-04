import { DndContext } from '@dnd-kit/core';
import { SortableContext } from '@dnd-kit/sortable';
import type { BudgetViewCategoryDto, BudgetViewTargetDto, TargetKind } from '@rondo/types';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { CategoryTile } from '@/components/category-tile';
import { LocaleProvider } from '@/i18n/locale-context';
import { en } from '@/i18n/messages/en';
import { moneyOf } from '@/lib/money';

const goal = (
  kind: TargetKind,
  parts: {
    amount: number;
    progress: number;
    monthTarget?: number;
    needed?: number;
  },
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

const category = (
  name: string,
  parts: { assigned: number; activity: number; available: number },
  target: BudgetViewTargetDto | null = null,
): BudgetViewCategoryDto => ({
  id: name,
  name,
  icon: 'plane',
  color: 'cyan',
  assigned: String(parts.assigned),
  activity: String(parts.activity),
  available: String(parts.available),
  availableAllTime: String(parts.available),
  hidden: false,
  paid: false,
  target,
});

const SHORT = category(
  'Vacation',
  { assigned: 20000, activity: 0, available: 40000 },
  goal('BY_DATE', { amount: 100000, progress: 40000, monthTarget: 26666, needed: 6666 }),
);

const COVERED = category(
  'Groceries',
  { assigned: 40000, activity: -21600, available: 18400 },
  goal('CONTRIBUTE', { amount: 40000, progress: 40000, monthTarget: 40000, needed: 0 }),
);

const SAVING = category(
  'Gifts',
  { assigned: 3000, activity: 0, available: 12000 },
  goal('ACCUMULATE', { amount: 50000, progress: 12000 }),
);

const PLAIN = category('Transport', { assigned: 12000, activity: -13400, available: 800 });

const draw = (
  shown: readonly BudgetViewCategoryDto[],
  money = moneyOf('ru-RU', 'PLN', 2, { signed: true }),
  onMoveOpen: () => void = () => {},
) =>
  render(
    <LocaleProvider>
      <DndContext>
        <SortableContext items={shown.map((one) => one.id)}>
          {shown.map((one) => (
            <CategoryTile
              key={one.id}
              category={one}
              money={money}
              failed={false}
              moveOpen={false}
              movePanel={null}
              moveInPopover
              onMoveOpen={onMoveOpen}
              onMoveClose={() => {}}
            />
          ))}
        </SortableContext>
      </DndContext>
    </LocaleProvider>,
  );

const tileOf = (name: string) => screen.getByTestId(`category-tile-${name}`);

afterEach(cleanup);

describe('what a goal puts on the card', () => {
  it('writes both amounts of the month as text, so the state is readable without colour', () => {
    draw([SHORT, COVERED]);

    expect(within(tileOf('Vacation')).getByTestId('assigned-Vacation')).toHaveTextContent(
      '200 / 266,66 zł',
    );
    expect(within(tileOf('Groceries')).getByTestId('assigned-Groceries')).toHaveTextContent(
      '400 / 400 zł',
    );
  });

  it('calls the row a monthly target when the goal asks for one, and assigned when it does not', () => {
    draw([SHORT, SAVING, PLAIN]);

    expect(
      within(tileOf('Vacation')).getByText(en['categories.goalMonthlyTarget']),
    ).toBeInTheDocument();
    expect(within(tileOf('Gifts')).getByText(en['categories.assigned'])).toBeInTheDocument();
    expect(within(tileOf('Transport')).getByText(en['categories.assigned'])).toBeInTheDocument();
  });

  it('marks the month short on one card and covered on the other, drawn side by side', () => {
    draw([SHORT, COVERED]);

    expect(within(tileOf('Vacation')).getByTestId('target-badge')).toHaveAttribute(
      'data-state',
      'short',
    );
    expect(within(tileOf('Groceries')).getByTestId('target-badge')).toHaveAttribute(
      'data-state',
      'covered',
    );
  });

  it('says the shortfall in words through the tooltip primitive, not a div of its own', async () => {
    const user = userEvent.setup();
    draw([SHORT]);

    await user.hover(within(tileOf('Vacation')).getByTestId('target-badge'));

    const tip = await screen.findByText(
      en['categories.goalShortfallTip'].replace('{{amount}}', '66,66 zł'),
    );

    expect(tip.closest('[data-slot="tooltip-content"]')).not.toBeNull();
  });

  it('says the month is done once nothing is left to assign', async () => {
    const user = userEvent.setup();
    draw([COVERED]);

    await user.hover(within(tileOf('Groceries')).getByTestId('target-badge'));

    expect(await screen.findByText(en['categories.goalCoveredTip'])).toBeInTheDocument();
  });

  it('opens the whole-goal panel on the icon and takes it away when the pointer leaves', async () => {
    const user = userEvent.setup();
    draw([SHORT]);

    const icon = within(tileOf('Vacation')).getByTestId('target-hover');

    expect(screen.queryByTestId('target-panel')).not.toBeInTheDocument();

    await user.hover(icon);
    expect(await screen.findByTestId('target-panel')).toBeInTheDocument();

    await user.unhover(icon);
    expect(screen.queryByTestId('target-panel')).not.toBeInTheDocument();
  });

  it('leaves the badge off a goal that asks for no month, and off a category with none', () => {
    draw([SHORT, SAVING, PLAIN]);

    expect(within(tileOf('Vacation')).getByTestId('target-badge')).toBeInTheDocument();
    expect(within(tileOf('Gifts')).queryByTestId('target-badge')).not.toBeInTheDocument();
    expect(within(tileOf('Transport')).queryByTestId('target-badge')).not.toBeInTheDocument();
    expect(within(tileOf('Gifts')).getByTestId('assigned-Gifts')).toHaveTextContent('30');
  });

  it('shows what the goal has counted this month, not what was assigned in it', () => {
    draw([
      category(
        'Vacation',
        { assigned: 0, activity: 0, available: 10000 },
        goal('BY_DATE', { amount: 30000, progress: 10000, monthTarget: 10000, needed: 0 }),
      ),
    ]);

    const tile = within(tileOf('Vacation'));

    expect(tile.getByTestId('assigned-Vacation')).toHaveTextContent('100 / 100');
    expect(tile.getByTestId('target-badge')).toHaveAttribute('data-state', 'covered');
  });

  it('reds the month when the goal has counted less than nothing, and only then', () => {
    draw([
      category(
        'Vacation',
        { assigned: -2000, activity: 0, available: 8000 },
        goal('BY_DATE', { amount: 30000, progress: 8000, monthTarget: 15000, needed: 7000 }),
      ),
      category(
        'Gifts',
        { assigned: -2000, activity: 0, available: 8000 },
        goal('CONTRIBUTE', { amount: 30000, progress: -2000, monthTarget: 30000, needed: 35000 }),
      ),
    ]);

    expect(within(tileOf('Vacation')).getByTestId('assigned-Vacation')).not.toHaveClass(
      'text-destructive',
    );
    expect(within(tileOf('Gifts')).getByTestId('assigned-Gifts')).toHaveClass('text-destructive');
  });

  it('prints the month the server sent rather than one it worked out from the goal', () => {
    draw([
      category(
        'Vacation',
        { assigned: 20000, activity: 0, available: 40000 },
        goal('BY_DATE', { amount: 100000, progress: 40000, monthTarget: 12345, needed: 6666 }),
      ),
    ]);

    expect(within(tileOf('Vacation')).getByTestId('assigned-Vacation')).toHaveTextContent('123,45');
  });

  it('carries the same numbers in text the card is described by, so no pointer is needed', () => {
    draw([SHORT]);

    const card = within(tileOf('Vacation')).getByRole('button', {
      name: en['categories.moveOpen'].replace('{{category}}', 'Vacation'),
    });
    const description = card.getAttribute('aria-describedby');

    expect(description).not.toBeNull();

    const spoken = document.getElementById(description ?? '');

    expect(spoken).not.toBeNull();
    expect(spoken).toHaveTextContent('200');
    expect(spoken).toHaveTextContent('266,66');
    expect(spoken).toHaveTextContent('600');
  });

  it('reds an assigned amount below zero, goal or no goal', () => {
    draw([
      category(
        'Vacation',
        { assigned: -5000, activity: 0, available: 15000 },
        goal('REFILL_TO', { amount: 30000, progress: 15000, monthTarget: 10000, needed: 15000 }),
      ),
    ]);

    expect(within(tileOf('Vacation')).getByTestId('assigned-Vacation')).toHaveClass(
      'text-destructive',
    );
  });

  it('opens the whole-goal panel from the keyboard without also opening the move form', async () => {
    const user = userEvent.setup();
    const opened = jest.fn();
    draw([SHORT], undefined, opened);

    const trigger = within(tileOf('Vacation')).getByTestId('target-hover');

    expect(trigger).not.toHaveAttribute('type');
    expect(trigger).toHaveAccessibleName(
      en['categories.goalExplain'].replace('{{category}}', 'Vacation'),
    );

    trigger.focus();
    await user.keyboard('{Enter}');

    expect(await screen.findByTestId('target-panel')).toBeInTheDocument();
    expect(opened).not.toHaveBeenCalled();
  });

  it('draws both rings in the category colour, their rest at a tenth of it', () => {
    draw([SHORT]);

    const tile = within(tileOf('Vacation'));

    expect(tile.getByTestId('goal-arc').getAttribute('stroke')).toBe('var(--cat-cyan)');
    expect(tile.getByTestId('goal-track').getAttribute('stroke')).toBe(
      'color-mix(in srgb, var(--cat-cyan) var(--track-alpha), transparent)',
    );
    expect(tile.getByTestId('month-track').getAttribute('stroke')).toBe(
      'color-mix(in srgb, var(--cat-cyan) var(--track-alpha), transparent)',
    );
  });

  it('keeps the ring in the category colour when the month is covered, badge apart', () => {
    draw([COVERED]);

    const arc = within(tileOf('Groceries')).getByTestId('month-arc');

    expect(arc.getAttribute('stroke')).toContain('--cat-cyan');
    expect(arc.getAttribute('class')).not.toContain('stroke-primary');
    expect(within(tileOf('Groceries')).getByTestId('target-badge')).toHaveAttribute(
      'data-state',
      'covered',
    );
  });

  it('writes the pair at the digit count the budget keeps, not at two', () => {
    draw([SHORT], moneyOf('ru-RU', 'JPY', 0, { signed: true }));

    expect(within(tileOf('Vacation')).getByTestId('assigned-Vacation')).toHaveTextContent(
      '20 000 / 26 666 ¥',
    );
  });
});

describe('a category closed for the month', () => {
  const drawOne = (shown: BudgetViewCategoryDto, props: { attention?: boolean } = {}) =>
    render(
      <LocaleProvider>
        <DndContext>
          <SortableContext items={[shown.id]}>
            <CategoryTile
              category={shown}
              money={moneyOf('ru-RU', 'PLN', 2, { signed: true })}
              failed={false}
              attention={props.attention ?? false}
              moveOpen={false}
              movePanel={null}
              moveInPopover
              onMoveOpen={() => {}}
              onMoveClose={() => {}}
            />
          </SortableContext>
        </DndContext>
      </LocaleProvider>,
    );

  it('is dimmed but keeps every amount, and names its state for a screen reader', () => {
    drawOne({ ...PLAIN, paid: true });

    const frame = screen.getByTestId('category-tile-Transport');
    expect(frame).toHaveAttribute('data-paid', 'true');
    expect(frame).toHaveClass('opacity-55');
    expect(frame).toHaveClass('hover:opacity-100');
    expect(within(frame).getByTestId('available-Transport')).toHaveTextContent('8 zł');
    expect(within(frame).getByTestId('paid-mark')).toHaveTextContent(en['categories.paidMark']);
  });

  it('cannot be dragged, so the order it keeps is the one it had before it was closed', () => {
    drawOne({ ...PLAIN, paid: true });

    expect(
      screen.queryByRole('button', {
        name: en['categories.reorder'].replace('{{category}}', 'Transport'),
      }),
    ).not.toBeInTheDocument();
  });

  it('is plain again when open, with the handle back and no mark', () => {
    drawOne(PLAIN);

    const frame = screen.getByTestId('category-tile-Transport');
    expect(frame).not.toHaveAttribute('data-paid');
    expect(frame).not.toHaveClass('opacity-55');
    expect(within(frame).queryByTestId('paid-mark')).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', {
        name: en['categories.reorder'].replace('{{category}}', 'Transport'),
      }),
    ).toBeInTheDocument();
  });

  it('takes a warning frame only when the screen asks for attention, and never a red one', () => {
    drawOne(PLAIN, { attention: true });

    const card = screen
      .getByTestId('category-tile-Transport')
      .querySelector('[data-slot="category-tile"]');
    expect(card).toHaveClass('ring-warning/45');
    expect(card).not.toHaveClass('ring-destructive/45');
  });
});
