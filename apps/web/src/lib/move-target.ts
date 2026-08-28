import {
  parseMoney,
  type BudgetViewGroupDto,
  type CategoryColor,
  type CategoryIcon,
} from '@rondo/types';

export const POOL = 'READY_TO_ASSIGN';

export interface MoveTarget {
  id: string;
  name: string;
  available: bigint;
  icon: CategoryIcon | null;
  color: CategoryColor | null;
}

export interface MoveTargetsInput {
  groups: readonly BudgetViewGroupDto[];
  readyToAssign: bigint;
  poolName: string;
  except: string;
  query: string;
}

export function moveTargets({
  groups,
  readyToAssign,
  poolName,
  except,
  query,
}: MoveTargetsInput): MoveTarget[] {
  const pool: MoveTarget = {
    id: POOL,
    name: poolName,
    available: readyToAssign,
    icon: null,
    color: null,
  };

  const categories = groups.flatMap((group) =>
    group.categories
      .filter((category) => category.id !== except)
      .map((category) => ({
        id: category.id,
        name: category.name,
        available: parseMoney(category.available),
        icon: category.icon,
        color: category.color,
      })),
  );

  const wanted = query.trim().toLocaleLowerCase();

  return [pool, ...categories].filter(
    (target) => wanted === '' || target.name.toLocaleLowerCase().includes(wanted),
  );
}
