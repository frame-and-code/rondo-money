import { fireEvent, render, screen } from '@testing-library/react';
import { StrictMode, useState } from 'react';

import { RollingAmount } from '@/components/rolling-amount';

function Stage({ steps }: { steps: Array<[string, bigint]> }) {
  const [at, setAt] = useState(0);
  const [amount, value] = steps[at] ?? steps[0] ?? ['', 0n];

  return (
    <>
      <button type="button" onClick={() => setAt((step) => step + 1)}>
        next
      </button>
      <RollingAmount data-testid="amount" amount={amount} value={value} />
    </>
  );
}

const rolled = (): HTMLElement => screen.getByTestId('amount');

const classesOf = (): string =>
  Array.from(rolled().querySelectorAll('span'))
    .map((cell) => cell.className)
    .join(' ');

const step = (): void => {
  fireEvent.click(screen.getByRole('button', { name: 'next' }));
};

describe('an amount that changes', () => {
  it('reads as the amount and nothing else once it has settled', () => {
    const amount = '1\u00a0234,56\u00a0zł';
    render(<RollingAmount data-testid="amount" amount={amount} value={123456n} />);

    expect(rolled().textContent).toBe(amount);
  });

  it('rolls up when it grows and down when it shrinks, deciding once for the whole number', () => {
    render(
      <Stage
        steps={[
          ['1,00 zł', 100n],
          ['1 000,00 zł', 100000n],
          ['1,00 zł', 100n],
        ]}
      />,
    );

    step();
    expect(classesOf()).toContain('animate-roll-in-up');
    expect(classesOf()).not.toContain('animate-roll-in-down');

    step();
    expect(classesOf()).toContain('animate-roll-in-down');
    expect(classesOf()).not.toContain('animate-roll-in-up');
  });

  it('decides the same way under the double render React does in development', () => {
    render(
      <StrictMode>
        <Stage
          steps={[
            ['1,00 zł', 100n],
            ['1 000,00 zł', 100000n],
          ]}
        />
      </StrictMode>,
    );

    step();

    expect(classesOf()).toContain('animate-roll-in-up');
    expect(classesOf()).not.toContain('animate-roll-in-down');
  });

  it('does not roll on the first render, because nothing changed yet', () => {
    render(<RollingAmount data-testid="amount" amount="1,00 zł" value={100n} />);

    expect(classesOf()).not.toContain('animate-roll-in');
  });
});
