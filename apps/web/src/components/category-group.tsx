'use client';

import {
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Button } from '@rondo/ui/components/ui/button';
import { cn } from '@rondo/ui/lib/utils';
import {
  IconChevronDown,
  IconEyeOff,
  IconGripVertical,
  IconPencil,
  IconPlus,
} from '@tabler/icons-react';
import { useId, useState, type ReactNode } from 'react';

import { useTranslations } from '@/i18n/locale-context';
import { reordered } from '@/lib/category-order';

export function CategoryGroup({
  id,
  name,
  available,
  categoryIds,
  sortable = true,
  onAdd,
  onRename,
  onHide,
  onReorder,
  children,
}: {
  id: string;
  name: string;
  available: string;
  categoryIds: string[];
  sortable?: boolean;
  onAdd: () => void;
  onRename: () => void;
  onHide: () => void;
  onReorder: (categoryIds: string[]) => void;
  children: ReactNode;
}) {
  const { t } = useTranslations();
  const [open, setOpen] = useState(true);
  const body = useId();
  const group = useSortable({ id, disabled: !sortable });

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const dropped = (event: DragEndEvent): void => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const from = categoryIds.indexOf(String(active.id));
    const to = categoryIds.indexOf(String(over.id));
    if (from < 0 || to < 0) return;

    onReorder(reordered(categoryIds, from, to));
  };

  const empty = (
    <Button
      variant="outline"
      data-testid={`empty-group-${id}`}
      aria-label={t('categories.addTo', { group: name })}
      onClick={onAdd}
      className={cn(
        'text-muted-foreground h-auto min-h-36 w-full flex-col gap-2 whitespace-normal',
        'rounded-[20px] border-dashed bg-transparent p-4',
        'duration-[120ms] hover:bg-muted/60 hover:text-foreground',
      )}
    >
      <span className="bg-muted flex size-10 items-center justify-center rounded-full">
        <IconPlus aria-hidden className="size-5" />
      </span>
      {t('categories.emptyGroupAdd')}
    </Button>
  );

  return (
    <section
      ref={group.setNodeRef}
      data-testid={`category-group-${id}`}
      style={{
        transform: CSS.Translate.toString(group.transform),
        transition: group.transition,
        zIndex: group.isDragging ? 1 : 0,
      }}
      className={cn('relative flex flex-col gap-2.5', group.isDragging && 'opacity-90')}
    >
      <div className="flex items-center gap-1.5">
        {sortable ? (
          <Button
            variant="ghost"
            size="icon-sm"
            data-testid={`reorder-group-${id}`}
            aria-label={t('categories.reorderGroup', { group: name })}
            className="text-muted-foreground/35 hover:text-muted-foreground hover:bg-muted/60 cursor-grab rounded-lg duration-[120ms]"
            {...group.attributes}
            {...group.listeners}
          >
            <IconGripVertical aria-hidden />
          </Button>
        ) : null}
        <Button
          variant="ghost"
          aria-expanded={open}
          aria-controls={body}
          aria-label={t('categories.groupToggle', { group: name })}
          onClick={() => setOpen((shown) => !shown)}
          className="group/fold h-[30px] min-w-0 shrink gap-1.5 rounded-[10px] px-0 text-left whitespace-normal text-[15px] font-semibold hover:bg-transparent aria-expanded:bg-transparent dark:hover:bg-transparent"
        >
          <IconChevronDown
            aria-hidden
            className={cn(
              'text-muted-foreground size-4 transition-transform duration-200',
              'motion-reduce:transition-none',
              open ? 'rotate-0' : '-rotate-90',
            )}
          />
          <span
            className={cn(
              'rounded-[10px] px-2 py-0.5 transition-colors duration-[120ms]',
              'group-hover/fold:bg-muted',
            )}
          >
            {name}
          </span>
        </Button>
        <div aria-hidden className="ms-1.5 h-px flex-1 bg-black/6 dark:bg-white/10" />
        <span className="ms-1.5 flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t('categories.addTo', { group: name })}
            onClick={onAdd}
            className="text-muted-foreground rounded-lg duration-[120ms]"
          >
            <IconPlus aria-hidden />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t('categories.renameGroup', { group: name })}
            onClick={onRename}
            className="text-muted-foreground rounded-lg duration-[120ms]"
          >
            <IconPencil aria-hidden />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t('categories.hideGroupTitle', { group: name })}
            onClick={onHide}
            className="text-muted-foreground rounded-lg duration-[120ms]"
          >
            <IconEyeOff aria-hidden />
          </Button>
        </span>
        <span className="ms-1.5 flex shrink-0 flex-col items-end md:flex-row md:items-baseline md:gap-1.5">
          <span className="text-muted-foreground order-2 text-xs md:order-1">
            {t('categories.available')}
          </span>
          <span
            data-testid={`group-total-${id}`}
            className="order-1 text-[15px] leading-tight font-semibold tabular-nums md:order-2"
          >
            {available}
          </span>
        </span>
      </div>

      <div
        id={body}
        aria-hidden={!open}
        className={cn(
          'grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none',
          open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
        )}
      >
        <div
          inert={!open}
          className={cn(
            'overflow-hidden transition-opacity duration-200 ease-out',
            'motion-reduce:transition-none',
            open ? 'opacity-100' : 'opacity-0',
          )}
        >
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={dropped}>
            <SortableContext items={categoryIds} strategy={rectSortingStrategy}>
              <div className="grid gap-4 px-1 py-1 md:grid-cols-2 xl:grid-cols-3">
                {categoryIds.length === 0 ? empty : children}
              </div>
            </SortableContext>
          </DndContext>
        </div>
      </div>
    </section>
  );
}
