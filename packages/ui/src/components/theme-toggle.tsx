'use client';

import { IconMoon, IconSun } from '@tabler/icons-react';
import { useTheme } from 'next-themes';

import { Button } from '@rondo/ui/components/ui/button';
import { switchTheme } from '@rondo/ui/lib/theme-switch';

export function ThemeToggle({ label }: { label: string }) {
  const { resolvedTheme, setTheme } = useTheme();

  return (
    <Button
      variant="outline"
      size="icon"
      className="relative"
      aria-label={label}
      onClick={() => switchTheme(() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark'))}
    >
      <IconSun className="scale-100 rotate-0 transition-all dark:scale-0 dark:-rotate-90" />
      <IconMoon className="absolute scale-0 rotate-90 transition-all dark:scale-100 dark:rotate-0" />
    </Button>
  );
}
