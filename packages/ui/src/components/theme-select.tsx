'use client';

import { IconDeviceDesktop, IconMoon, IconSun, type TablerIcon } from '@tabler/icons-react';
import { useTheme } from 'next-themes';
import { useState } from 'react';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@rondo/ui/components/ui/select';

export const THEMES = ['system', 'light', 'dark'] as const;

export type Theme = (typeof THEMES)[number];

const THEME_ICONS: Record<Theme, TablerIcon> = {
  system: IconDeviceDesktop,
  light: IconSun,
  dark: IconMoon,
};

function ThemeOption({ theme, label }: { theme: Theme; label: string }) {
  const Icon = THEME_ICONS[theme];

  return (
    <>
      <Icon className="text-muted-foreground" />
      {label}
    </>
  );
}

function isTheme(value: string): value is Theme {
  return THEMES.some((theme) => theme === value);
}

export function ThemeSelect({
  label,
  labels,
  className,
}: {
  label: string;
  labels: Record<Theme, string>;
  className?: string;
}) {
  const { theme, setTheme } = useTheme();
  const chosen: Theme = theme !== undefined && isTheme(theme) ? theme : 'system';

  const [picked, setPicked] = useState<Theme | null>(null);

  return (
    <Select
      value={chosen}
      onValueChange={(next: string | null) => {
        if (next !== null && isTheme(next) && next !== chosen) {
          setPicked(next);
        }
      }}
      onOpenChangeComplete={(open: boolean) => {
        if (open || picked === null) return;

        setPicked(null);
        setTheme(picked);
      }}
    >
      <SelectTrigger aria-label={label} className={className}>
        <SelectValue>
          {(picked: Theme) => <ThemeOption theme={picked} label={labels[picked]} />}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {THEMES.map((option) => (
          <SelectItem key={option} value={option}>
            <ThemeOption theme={option} label={labels[option]} />
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
