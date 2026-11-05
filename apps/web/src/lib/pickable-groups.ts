import { type PickableCategory, type PickableGroup } from '@/components/transaction-dialog';

interface ViewOfGroups {
  groups: readonly {
    id: string;
    name: string;
    hidden: boolean;
    categories: readonly (PickableCategory & { hidden: boolean })[];
  }[];
}

export function pickableGroups(view: ViewOfGroups | undefined): PickableGroup[] {
  return (view?.groups ?? [])
    .filter((group) => !group.hidden)
    .map((group) => ({
      id: group.id,
      name: group.name,
      categories: group.categories
        .filter((category) => !category.hidden)
        .map((category) => ({
          id: category.id,
          name: category.name,
          icon: category.icon,
          color: category.color,
        })),
    }))
    .filter((group) => group.categories.length > 0);
}

export function offeredCategory(
  groups: readonly PickableGroup[],
  id: string | null,
): string | null {
  return id !== null && groups.some((group) => group.categories.some((one) => one.id === id))
    ? id
    : null;
}
