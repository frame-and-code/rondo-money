'use client';

import { Button } from '@rondo/ui/components/ui/button';
import { cn } from '@rondo/ui/lib/utils';
import { IconChevronDown, IconEyeOff, IconPencil } from '@tabler/icons-react';
import { useId, useState, type ReactNode } from 'react';

import { useTranslations } from '@/i18n/locale-context';

function Row({ label, icon, onClick }: { label: string; icon: ReactNode; onClick: () => void }) {
  return (
    <Button
      type="button"
      variant="ghost"
      onClick={onClick}
      className="h-9 w-full justify-start gap-2.5 rounded-xl px-2.5 text-sm font-normal"
    >
      <span className="text-muted-foreground flex size-4 items-center justify-center">{icon}</span>
      {label}
    </Button>
  );
}

export function CategoryActions({
  category,
  onEdit,
  onHide,
}: {
  category: { id: string; name: string };
  onEdit: () => void;
  onHide: () => void;
}) {
  const { t } = useTranslations();
  const [open, setOpen] = useState(false);
  const body = useId();

  return (
    <div className="flex flex-col" data-testid={`category-actions-${category.id}`}>
      <div aria-hidden className="bg-border/60 mb-1 h-px w-full" />

      <button
        type="button"
        aria-expanded={open}
        aria-controls={body}
        onClick={() => setOpen((shown) => !shown)}
        className="text-muted-foreground hover:bg-muted flex h-9 items-center gap-1.5 rounded-xl px-2.5 text-sm transition-colors duration-[120ms]"
      >
        <IconChevronDown
          aria-hidden
          className={cn(
            'size-4 transition-transform duration-200 motion-reduce:transition-none',
            open ? 'rotate-0' : '-rotate-90',
          )}
        />
        {t('categories.manage')}
      </button>

      <div
        id={body}
        className={cn(
          'grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none',
          open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
        )}
      >
        <div className="overflow-hidden">
          {open ? (
            <div className="flex flex-col gap-0.5 pt-1">
              <Row label={t('categories.edit')} icon={<IconPencil />} onClick={onEdit} />
              <Row label={t('categories.hide')} icon={<IconEyeOff />} onClick={onHide} />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
