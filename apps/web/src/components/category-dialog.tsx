'use client';

import {
  CATEGORY_COLORS,
  CATEGORY_ICONS,
  type CategoryColor,
  type CategoryIcon,
} from '@rondo/types';
import { Button } from '@rondo/ui/components/ui/button';
import { Input } from '@rondo/ui/components/ui/input';
import { Label } from '@rondo/ui/components/ui/label';
import {
  Popover,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger,
} from '@rondo/ui/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@rondo/ui/components/ui/select';
import { cn } from '@rondo/ui/lib/utils';
import { useEffect, useId, useRef, useState } from 'react';

import { useTranslations } from '@/i18n/locale-context';
import type { MessageKey } from '@/i18n/messages';
import { categoryLook } from '@/lib/category-look';

export interface CategoryDraft {
  name: string;
  groupId: string;
  icon: CategoryIcon | null;
  color: CategoryColor | null;
  idempotencyKey: string;
}

export function CategoryDialog({
  category,
  groupId: into,
  failed,
  groups,
  onSave,
  onCancel,
}: {
  category: {
    id: string;
    name: string;
    groupId: string;
    icon: CategoryIcon | null;
    color: CategoryColor | null;
  } | null;
  groupId: string;
  failed: MessageKey | null;
  groups: { id: string; name: string }[];
  onSave: (draft: CategoryDraft) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslations();
  const groupField = useId();

  const [key] = useState(() => crypto.randomUUID());
  const [name, setName] = useState(category?.name ?? '');
  const [groupId, setGroupId] = useState(category?.groupId ?? into);
  const [icon, setIcon] = useState<CategoryIcon | null>(category?.icon ?? null);
  const [color, setColor] = useState<CategoryColor | null>(category?.color ?? null);
  const [picking, setPicking] = useState(false);
  const field = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const node = field.current;
    if (node === null) return;

    node.focus();
    node.setSelectionRange(node.value.length, node.value.length);
  }, []);

  const look = categoryLook(icon, color);
  const ready = name.trim().length > 0 && groupId !== '';

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <div className="flex flex-col gap-1.5 pe-10">
        <h2 className="text-base leading-tight font-medium">{t('categories.dialogTitle')}</h2>
      </div>

      <div className="bg-muted/60 flex items-center gap-3 rounded-[18px] px-4 py-3">
        <Popover open={picking} onOpenChange={setPicking}>
          <PopoverTrigger
            aria-label={t('categories.lookPick')}
            className="aria-expanded:ring-ring/60 flex size-10 shrink-0 items-center justify-center rounded-full transition-shadow duration-[120ms] hover:ring-2 hover:ring-foreground/15 aria-expanded:ring-2"
            style={{
              color: look.color,
              background: `color-mix(in oklch, ${look.color} 14%, transparent)`,
            }}
          >
            <look.Icon aria-hidden className="size-5" />
          </PopoverTrigger>

          <PopoverContent
            align="start"
            sideOffset={8}
            className="w-[min(21rem,calc(100vw-3rem))] gap-4 rounded-[20px] p-4"
          >
            <PopoverTitle className="sr-only">{t('categories.lookPick')}</PopoverTitle>

            <div className="flex flex-col gap-2">
              <Label>{t('categories.iconLabel')}</Label>
              <div className="bg-muted/40 grid max-h-56 grid-cols-[repeat(auto-fill,minmax(34px,1fr))] justify-items-center gap-1 overflow-y-auto rounded-[16px] p-2">
                {CATEGORY_ICONS.map((one) => {
                  const { Icon } = categoryLook(one, null);

                  return (
                    <button
                      key={one}
                      type="button"
                      data-testid={`icon-${one}`}
                      aria-label={t(`categoryIcon.${one}`)}
                      aria-pressed={icon === one}
                      onClick={() => setIcon(one)}
                      className={cn(
                        'flex size-8 items-center justify-center rounded-full transition-colors duration-[120ms]',
                        icon === one ? 'bg-foreground/10' : 'text-muted-foreground hover:bg-muted',
                      )}
                      style={icon === one ? { color: look.color } : undefined}
                    >
                      <Icon aria-hidden className="size-[18px]" />
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <Label>{t('categories.colorLabel')}</Label>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(26px,1fr))] gap-2">
                {CATEGORY_COLORS.map((one) => (
                  <button
                    key={one}
                    type="button"
                    data-testid={`color-${one}`}
                    aria-label={t(`categoryColor.${one}`)}
                    aria-pressed={color === one}
                    onClick={() => setColor(one)}
                    className="size-[26px] rounded-full"
                    style={{
                      background: `var(--cat-${one})`,
                      boxShadow:
                        color === one
                          ? '0 0 0 2px var(--popover), 0 0 0 4px var(--foreground)'
                          : undefined,
                    }}
                  />
                ))}
              </div>
            </div>
          </PopoverContent>
        </Popover>

        <Input
          ref={field}
          aria-label={t('categories.nameLabel')}
          placeholder={t('categories.nameLabel')}
          value={name}
          maxLength={60}
          onChange={(event) => setName(event.target.value)}
          className="hover:border-input focus-visible:bg-background dark:focus-visible:bg-background h-9 min-w-0 flex-1 border-transparent bg-transparent px-3 text-[15px] font-medium dark:bg-transparent"
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor={groupField}>{t('categories.groupLabel')}</Label>
        <Select
          value={groupId}
          onValueChange={(next: string | null) => {
            if (next !== null) setGroupId(next);
          }}
        >
          <SelectTrigger id={groupField} aria-label={t('categories.groupLabel')} className="w-full">
            <SelectValue>
              {(picked: string) => groups.find((group) => group.id === picked)?.name ?? ''}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {groups.map((group) => (
              <SelectItem key={group.id} value={group.id}>
                {group.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
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
          disabled={!ready}
          onClick={() => onSave({ name: name.trim(), groupId, icon, color, idempotencyKey: key })}
        >
          {t('categories.save')}
        </Button>
      </div>
    </div>
  );
}
