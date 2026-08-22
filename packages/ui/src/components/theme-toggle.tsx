'use client';

import { Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';

import { Button } from '@rondo/ui/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@rondo/ui/components/ui/dropdown-menu';

export interface ThemeToggleLabels {
  trigger: string;
  light: string;
  dark: string;
  system: string;
}

export function ThemeToggle({ labels }: { labels: ThemeToggleLabels }) {
  const { setTheme } = useTheme();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon" aria-label={labels.trigger}>
          <Sun className="scale-100 rotate-0 transition-all dark:scale-0 dark:-rotate-90" />
          <Moon className="absolute scale-0 rotate-90 transition-all dark:scale-100 dark:rotate-0" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => setTheme('light')}>{labels.light}</DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme('dark')}>{labels.dark}</DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme('system')}>{labels.system}</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
