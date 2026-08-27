import { type CategoryColor, type CategoryIcon } from '@rondo/types';
import {
  IconBolt,
  IconCar,
  IconCoffee,
  IconCoin,
  IconDots,
  IconHeart,
  IconHome,
  IconMusic,
  IconRepeat,
  IconShield,
  IconShoppingCart,
  IconWifi,
} from '@tabler/icons-react';

import type { TablerIcon } from '@tabler/icons-react';

export interface CategoryLook {
  Icon: TablerIcon;
  color: string;
}

const ICONS: Record<CategoryIcon, TablerIcon> = {
  home: IconHome,
  bolt: IconBolt,
  wifi: IconWifi,
  cart: IconShoppingCart,
  car: IconCar,
  coffee: IconCoffee,
  music: IconMusic,
  heart: IconHeart,
  repeat: IconRepeat,
  shield: IconShield,
  dots: IconDots,
};

const HUES: Record<CategoryColor, number> = {
  blue: 242,
  cyan: 205,
  teal: 175,
  green: 145,
  amber: 85,
  orange: 55,
  rose: 20,
  violet: 300,
  plum: 330,
  slate: 265,
};

const NEUTRAL = 'var(--muted-foreground)';

export function categoryLook(icon: CategoryIcon | null, color: CategoryColor | null): CategoryLook {
  return {
    Icon: icon === null ? IconCoin : ICONS[icon],
    color: color === null ? NEUTRAL : `oklch(0.65 0.13 ${HUES[color]})`,
  };
}
