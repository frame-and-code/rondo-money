'use client';

import { IconWallet } from '@tabler/icons-react';

import { SectionSlot } from '@/components/section-slot';

export default function CategoriesPage() {
  return (
    <SectionSlot Icon={IconWallet} titleKey="categories.slotTitle" bodyKey="categories.slotBody" />
  );
}
