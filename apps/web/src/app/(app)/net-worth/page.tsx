'use client';

import { IconTrendingUp } from '@tabler/icons-react';

import { SectionSlot } from '@/components/section-slot';

export default function NetWorthPage() {
  return (
    <SectionSlot Icon={IconTrendingUp} titleKey="netWorth.slotTitle" bodyKey="netWorth.slotBody" />
  );
}
