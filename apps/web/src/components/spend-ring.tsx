'use client';

import type { CategoryColor, CategoryIcon } from '@rondo/types';

import { categoryLook } from '@/lib/category-look';

const RADIUS = 27;
const HALO = 34;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const HALO_CIRCUMFERENCE = 2 * Math.PI * HALO;

function arc(circumference: number, from: number, to: number) {
  return {
    strokeDasharray: `${(to - from) * circumference} ${circumference}`,
    strokeDashoffset: -from * circumference,
  };
}

export function SpendRing({
  icon,
  color,
  fill,
  head,
  goalShare,
  overspent,
  size = 72,
}: {
  icon: CategoryIcon | null;
  color: CategoryColor | null;
  fill: number;
  head: number;
  goalShare: number | null;
  overspent: boolean;
  size?: number;
}) {
  const look = categoryLook(icon, color);
  const painted = overspent ? 'var(--destructive)' : look.color;
  const pale = `color-mix(in srgb, ${painted} 32%, transparent)`;
  const track = `color-mix(in srgb, ${painted} var(--track-alpha), transparent)`;
  const scale = size / 72;
  const spent = Math.min(head, fill);

  return (
    <span
      aria-hidden
      className="relative shrink-0"
      style={{ width: size, height: size }}
      data-slot="spend-ring"
    >
      <svg viewBox="0 0 72 72" width={size} height={size} className="-rotate-90">
        {goalShare === null ? null : (
          <>
            <circle
              cx="36"
              cy="36"
              r={HALO}
              fill="none"
              strokeWidth={2.5}
              data-testid="goal-track"
              stroke={track}
            />
            <circle
              cx="36"
              cy="36"
              r={HALO}
              fill="none"
              strokeWidth={2.5}
              strokeLinecap="round"
              data-testid="goal-arc"
              stroke={painted}
              {...arc(HALO_CIRCUMFERENCE, 0, Math.min(1, goalShare))}
            />
          </>
        )}

        <circle
          cx="36"
          cy="36"
          r={RADIUS}
          fill="none"
          strokeWidth={6}
          data-testid="month-track"
          stroke={track}
        />

        <circle
          cx="36"
          cy="36"
          r={RADIUS}
          fill="none"
          strokeWidth={6}
          strokeLinecap="round"
          data-testid="spent-arc"
          stroke={pale}
          {...arc(CIRCUMFERENCE, 0, spent)}
        />

        <circle
          cx="36"
          cy="36"
          r={RADIUS}
          fill="none"
          strokeWidth={6}
          strokeLinecap="round"
          data-testid="month-arc"
          stroke={painted}
          className="transition-[stroke-dasharray] duration-700 ease-out motion-reduce:transition-none"
          {...arc(CIRCUMFERENCE, spent, Math.min(1, fill))}
        />
      </svg>
      <span className="absolute inset-0 grid place-items-center" style={{ color: painted }}>
        <look.Icon data-testid="category-icon" style={{ width: 24 * scale, height: 24 * scale }} />
      </span>
    </span>
  );
}
