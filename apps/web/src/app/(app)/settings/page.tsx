'use client';

import { IconSettings } from '@tabler/icons-react';

import { SectionSlot } from '@/components/section-slot';

export default function SettingsPage() {
  return (
    <SectionSlot Icon={IconSettings} titleKey="settings.slotTitle" bodyKey="settings.slotBody" />
  );
}
