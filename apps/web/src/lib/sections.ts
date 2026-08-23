import { IconBuildingBank, IconSettings, IconTrendingUp, IconWallet } from '@tabler/icons-react';

import type { MessageKey } from '@/i18n/messages';

import type { TablerIcon } from '@tabler/icons-react';

export interface Section {
  href: string;
  labelKey: MessageKey;
  Icon: TablerIcon;
}

export const sections: Section[] = [
  { href: '/categories', labelKey: 'nav.categories', Icon: IconWallet },
  { href: '/accounts', labelKey: 'nav.accounts', Icon: IconBuildingBank },
  { href: '/net-worth', labelKey: 'nav.netWorth', Icon: IconTrendingUp },
  { href: '/settings', labelKey: 'nav.settings', Icon: IconSettings },
];

export function activeSection(pathname: string): Section | undefined {
  return sections.find(
    (section) => pathname === section.href || pathname.startsWith(`${section.href}/`),
  );
}
