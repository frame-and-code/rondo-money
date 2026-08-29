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
