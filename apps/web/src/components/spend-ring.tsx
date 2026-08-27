'use client';

import type { CategoryColor, CategoryIcon } from '@rondo/types';
import { cn } from '@rondo/ui/lib/utils';

import { categoryLook } from '@/lib/category-look';

const RADIUS = 30;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function SpendRing({
  icon,
  color,
  fraction,
  overspent,
  size = 72,
}: {
  icon: CategoryIcon | null;
  color: CategoryColor | null;
  fraction: number;
  overspent: boolean;
  size?: number;
}) {
  const look = categoryLook(icon, color);
  const stroke = overspent ? 'var(--destructive)' : look.color;
  const scale = size / 72;

  return (
    <span
      aria-hidden
      className="relative shrink-0"
      style={{ width: size, height: size }}
      data-slot="spend-ring"
    >
      <svg viewBox="0 0 72 72" width={size} height={size} className="-rotate-90">
        <circle cx="36" cy="36" r={RADIUS} fill="none" stroke="var(--muted)" strokeWidth={6} />
        <circle
          cx="36"
          cy="36"
          r={RADIUS}
          fill="none"
          stroke={stroke}
          strokeWidth={6}
          strokeLinecap="round"
          strokeDasharray={`${CIRCUMFERENCE * fraction} ${CIRCUMFERENCE}`}
          className="transition-[stroke-dasharray] duration-700 ease-out motion-reduce:transition-none"
        />
      </svg>
      <span
        className={cn('absolute inset-0 grid place-items-center')}
        style={{ color: look.color }}
      >
        <look.Icon data-testid="category-icon" style={{ width: 24 * scale, height: 24 * scale }} />
      </span>
    </span>
  );
}
