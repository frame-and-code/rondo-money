'use client';

import { cn } from '@rondo/ui/lib/utils';
import { useEffect, useState, type ComponentProps } from 'react';

const STEP_MS = 28;
const STEPS_MAX = 6;
const BASE_MS = 220;
const PER_DIGIT_MS = 42;
const SETTLE_MS = BASE_MS + PER_DIGIT_MS * 9 + STEP_MS * STEPS_MAX + 60;

const DIGIT = /\d/;

function zeroed(amount: string): string {
  return amount.replace(/\d/g, '0');
}

function delayOf(at: number, width: number): string {
  return `${Math.min(width - 1 - at, STEPS_MAX) * STEP_MS}ms`;
}

function distanceOf(character: string, leaving: string | null): number {
  if (leaving === null || leaving === character) {
    return 1;
  }

  if (!DIGIT.test(character) || !DIGIT.test(leaving)) {
    return 3;
  }

  return Math.abs(Number(character) - Number(leaving));
}

function durationOf(character: string, leaving: string | null): string {
  return `${BASE_MS + PER_DIGIT_MS * distanceOf(character, leaving)}ms`;
}

interface Rolling {
  shown: string;
  held: bigint;
  leaving: string | null;
  up: boolean;
  turn: number;
}

function cellsOf(shown: string, leaving: string | null): Array<[string, string | null]> {
  const width = Math.max(shown.length, leaving?.length ?? 0);
  const pad = (value: string): string => value.padStart(width, ' ');
  const now = pad(shown);
  const before = leaving === null ? null : pad(leaving);

  return Array.from({ length: width }, (_, at) => [now[at] ?? ' ', before?.[at] ?? null]);
}

export function RollingAmount({
  amount,
  value,
  className,
  rollOnMount = false,
  ...rest
}: {
  amount: string;
  value: bigint;
  className?: string;
  rollOnMount?: boolean;
} & Omit<ComponentProps<'span'>, 'children'>) {
  const [rolling, setRolling] = useState<Rolling>({
    shown: amount,
    held: value,
    leaving: rollOnMount ? zeroed(amount) : null,
    up: true,
    turn: 0,
  });

  if (rolling.shown !== amount) {
    setRolling((current) =>
      current.shown === amount
        ? current
        : {
            shown: amount,
            held: value,
            leaving: current.shown,
            up: value > current.held,
            turn: current.turn + 1,
          },
    );
  }

  useEffect(() => {
    if (rolling.leaving === null) return;

    const settle = setTimeout(
      () => setRolling((current) => ({ ...current, leaving: null })),
      SETTLE_MS,
    );

    return () => clearTimeout(settle);
  }, [rolling.leaving, rolling.turn]);

  const cells = cellsOf(rolling.shown, rolling.leaving);

  return (
    <span {...rest} className={cn('inline-flex tabular-nums', className)}>
      {cells.map(([character, leaving], at) => (
        <span key={at} className="relative inline-block h-[1.15em] overflow-hidden">
          <span
            key={`${rolling.turn}-${character}`}
            style={{
              animationDelay: delayOf(at, cells.length),
              animationDuration: durationOf(character, leaving),
            }}
            className={cn(
              'block',
              leaving !== null &&
                (rolling.up
                  ? 'motion-safe:animate-roll-in-up'
                  : 'motion-safe:animate-roll-in-down'),
            )}
          >
            {character === ' ' ? ' ' : character}
          </span>
          {leaving === null || rolling.turn === 0 ? null : (
            <span
              aria-hidden
              style={{
                animationDelay: delayOf(at, cells.length),
                animationDuration: durationOf(character, leaving),
              }}
              className={cn(
                'absolute inset-x-0 top-0 block',
                rolling.up
                  ? 'motion-safe:animate-roll-out-up'
                  : 'motion-safe:animate-roll-out-down',
                'motion-reduce:hidden',
              )}
            >
              {leaving === ' ' ? ' ' : leaving}
            </span>
          )}
        </span>
      ))}
    </span>
  );
}
