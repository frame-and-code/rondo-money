export function reordered(ids: readonly string[], from: number, to: number): string[] {
  if (from < 0 || to < 0 || from >= ids.length || to >= ids.length) {
    throw new Error(
      `A category cannot be dropped outside the list it came from: ${from} to ${to} in a list ` +
        `of ${ids.length}`,
    );
  }

  const next = [...ids];
  const [moved] = next.splice(from, 1);

  return moved === undefined ? next : [...next.slice(0, to), moved, ...next.slice(to)];
}

export function reorderedView<
  Category extends { id: string },
  Group extends { id: string; categories: Category[] },
  View extends { groups: Group[] },
>(view: View, groupId: string, categoryIds: readonly string[]): View {
  const groups = view.groups.map((group) => {
    if (group.id !== groupId) {
      return group;
    }

    const held = new Map(group.categories.map((category) => [category.id, category]));
    const moved = categoryIds.flatMap((id) => {
      const category = held.get(id);

      return category === undefined ? [] : [category];
    });

    return moved.length === group.categories.length ? { ...group, categories: moved } : group;
  });

  return { ...view, groups };
}

export function reorderedGroups<Group extends { id: string }, View extends { groups: Group[] }>(
  view: View,
  groupIds: readonly string[],
): View {
  const held = new Map(view.groups.map((group) => [group.id, group]));
  const moved = groupIds.flatMap((id) => {
    const group = held.get(id);

    return group === undefined ? [] : [group];
  });

  return moved.length === view.groups.length ? { ...view, groups: moved } : view;
}

export function shownOrder<Category extends { paid: boolean }>(
  categories: readonly Category[],
): Category[] {
  return [
    ...categories.filter((category) => !category.paid),
    ...categories.filter((category) => category.paid),
  ];
}

export function storedOrder(
  stored: readonly string[],
  paid: ReadonlySet<string>,
  shown: readonly string[],
): string[] {
  const sameSet =
    stored.length === shown.length && [...stored].sort().join() === [...shown].sort().join();

  if (!sameSet) {
    throw new Error(
      `The shown order names different categories than the stored one: ${shown.join(', ')} ` +
        `against ${stored.join(', ')}`,
    );
  }

  const open = shown.filter((id) => !paid.has(id));
  const closed = shown.filter((id) => paid.has(id));
  let nextOpen = 0;
  let nextClosed = 0;

  return stored.map((id) => {
    const taken = paid.has(id) ? closed[nextClosed++] : open[nextOpen++];

    return taken ?? id;
  });
}
