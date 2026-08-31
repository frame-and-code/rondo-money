import { IconCoins, IconSettings, IconTrendingUp, IconWallet } from '@tabler/icons-react';

import type { MessageKey } from '@/i18n/messages';

import type { TablerIcon } from '@tabler/icons-react';

export interface Section {
  href: string;
  labelKey: MessageKey;
  Icon: TablerIcon;
}

export const sections: Section[] = [
  { href: '/categories', labelKey: 'nav.categories', Icon: IconWallet },
  { href: '/accounts', labelKey: 'nav.accounts', Icon: IconCoins },
  { href: '/net-worth', labelKey: 'nav.netWorth', Icon: IconTrendingUp },
  { href: '/settings', labelKey: 'nav.settings', Icon: IconSettings },
];

export const APP_NAME = 'Rondo Money';

export function documentTitle(
  section: Section | undefined,
  label: (of: Section) => string,
): string {
  return section === undefined ? APP_NAME : `${label(section)} - ${APP_NAME}`;
}

export function activeSection(pathname: string): Section | undefined {
  return sections.find(
    (section) => pathname === section.href || pathname.startsWith(`${section.href}/`),
  );
}
