import { type BudgetViewGroupDto } from '@rondo/types';

import { moveTargets, POOL } from '@/lib/move-target';

const FOOD = '0199c1a8-9ecf-71c7-a617-c575df073700';
const CAR = '0199c1a8-9ecf-71c7-a617-c575df073701';
const RENT = '0199c1a8-9ecf-71c7-a617-c575df073702';

const category = (
  id: string,
  name: string,
  available: string,
): BudgetViewGroupDto['categories'][number] => ({
  id,
  name,
  icon: 'shopping-cart',
  color: 'green',
  assigned: '0',
  activity: '0',
  available,
  availableAllTime: available,
  hidden: false,
});

const groups: BudgetViewGroupDto[] = [
  {
    id: 'g1',
    name: 'Обязательные',
    hidden: false,
    categories: [category(RENT, 'Аренда', '4500000')],
  },
  {
    id: 'g2',
    name: 'Автомобиль',
    hidden: false,
    categories: [category(FOOD, 'Продукты', '420000'), category(CAR, 'Транспорт', '-125000')],
  },
];

const targets = (over: Partial<Parameters<typeof moveTargets>[0]> = {}) =>
  moveTargets({
    groups,
    readyToAssign: 830000n,
    poolName: 'Свободные деньги',
    except: FOOD,
    query: '',
    ...over,
  });

describe('the envelopes a move can name as its other side', () => {
  it('puts what is free first, then the categories in the order the month gave them', () => {
    expect(targets().map((one) => one.name)).toEqual(['Свободные деньги', 'Аренда', 'Транспорт']);
  });

  it('carries what each envelope holds, so the row can show it', () => {
    const [pool, rent] = targets();

    expect(pool).toMatchObject({ id: POOL, available: 830000n });
    expect(rent).toMatchObject({ id: RENT, available: 4500000n });
  });

  it('leaves out the category the move is being made from, so no side can name itself twice', () => {
    expect(targets().map((one) => one.id)).not.toContain(FOOD);
    expect(targets({ except: CAR }).map((one) => one.id)).not.toContain(CAR);
  });

  it('finds a category by part of its name, whatever the case', () => {
    expect(targets({ query: 'ТРАНС' }).map((one) => one.name)).toEqual(['Транспорт']);
    expect(targets({ query: 'нсп' }).map((one) => one.name)).toEqual(['Транспорт']);
  });

  it('searches what is free by name as well, rather than pinning it past the search', () => {
    expect(targets({ query: 'свобод' }).map((one) => one.id)).toEqual([POOL]);
    expect(targets({ query: 'аренд' }).map((one) => one.id)).toEqual([RENT]);
  });

  it('answers with nothing when the search matches nothing', () => {
    expect(targets({ query: 'ипотека' })).toEqual([]);
  });
});
