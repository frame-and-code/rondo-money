'use client';

import { useTranslations } from '@/i18n/locale-context';
import type { MessageKey } from '@/i18n/messages';

import type { TablerIcon } from '@tabler/icons-react';

export function SectionSlot({
  Icon,
  titleKey,
  bodyKey,
}: {
  Icon: TablerIcon;
  titleKey: MessageKey;
  bodyKey: MessageKey;
}) {
  const { t } = useTranslations();

  return (
    <div className="flex h-full items-center justify-center rounded-xl border border-dashed p-6">
      <div className="flex max-w-sm flex-col items-center gap-3 text-center">
        <div className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <Icon className="size-5" />
        </div>
        <p className="text-base font-semibold">{t(titleKey)}</p>
        <p className="text-sm text-muted-foreground">{t(bodyKey)}</p>
      </div>
    </div>
  );
}
