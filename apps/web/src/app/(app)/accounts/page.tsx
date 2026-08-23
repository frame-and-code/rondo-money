'use client';

import { IconBuildingBank } from '@tabler/icons-react';

import { SectionSlot } from '@/components/section-slot';

export default function AccountsPage() {
  return (
    <SectionSlot
      Icon={IconBuildingBank}
      titleKey="accounts.slotTitle"
      bodyKey="accounts.slotBody"
    />
  );
}
