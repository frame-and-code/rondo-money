'use client';

import { Button } from '@rondo/ui/components/ui/button';
import { Input } from '@rondo/ui/components/ui/input';
import { Label } from '@rondo/ui/components/ui/label';
import { useEffect, useId, useRef, useState } from 'react';

import { useTranslations } from '@/i18n/locale-context';
import type { MessageKey } from '@/i18n/messages';

export interface GroupDraft {
  name: string;
  idempotencyKey: string;
}

export function GroupDialog({
  group,
  failed,
  busy = false,
  onSave,
  onCancel,
}: {
  group: { id: string; name: string } | null;
  failed: MessageKey | null;
  busy?: boolean;
  onSave: (draft: GroupDraft) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslations();
  const field = useId();
  const name = useRef<HTMLInputElement>(null);

  const [key] = useState(() => crypto.randomUUID());
  const [typed, setTyped] = useState(group?.name ?? '');

  useEffect(() => {
    const node = name.current;
    if (node === null) return;

    node.focus();
    node.setSelectionRange(node.value.length, node.value.length);
  }, []);

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <div className="flex flex-col gap-1.5 pe-10">
        <h2 className="text-base leading-tight font-medium">{t('categories.groupDialogTitle')}</h2>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor={field}>{t('categories.nameLabel')}</Label>
        <Input
          id={field}
          ref={name}
          value={typed}
          maxLength={60}
          onChange={(event) => setTyped(event.target.value)}
        />
      </div>

      {failed === null ? null : (
        <p role="alert" className="text-destructive text-sm">
          {t(failed)}
        </p>
      )}

      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          {t('categories.cancel')}
        </Button>
        <Button
          type="button"
          disabled={typed.trim().length === 0 || busy}
          onClick={() => onSave({ name: typed.trim(), idempotencyKey: key })}
        >
          {t('categories.save')}
        </Button>
      </div>
    </div>
  );
}
