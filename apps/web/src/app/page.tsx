import { ThemeToggle } from '@ffai/ui/components/theme-toggle';
import { Button } from '@ffai/ui/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@ffai/ui/components/ui/card';
import { Input } from '@ffai/ui/components/ui/input';
import { Label } from '@ffai/ui/components/ui/label';
import { Separator } from '@ffai/ui/components/ui/separator';

import { API_BASE_URL } from '@/lib/api';

// Start page (F0.5) + shadcn/ui demo screen (F0.6 DoD): shows the base primitives and
// the theme toggle so light/dark/system can be checked visually in one place.
export default function HomePage() {
  return (
    <main className="mx-auto flex max-w-xl flex-col gap-6 p-8">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Fin Flow AI</h1>
          <p className="text-sm text-muted-foreground">Каркас приложения · Фаза 0 (F0.6).</p>
        </div>
        <ThemeToggle />
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Демо компонентов</CardTitle>
          <CardDescription>shadcn/ui + тема Ocean Breeze</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-2">
            <Button>По умолчанию</Button>
            <Button variant="secondary">Вторичная</Button>
            <Button variant="outline">Контур</Button>
            <Button variant="ghost">Прозрачная</Button>
            <Button variant="destructive">Опасная</Button>
          </div>
          <Separator />
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="budget-name">Название бюджета</Label>
            <Input id="budget-name" placeholder="Например, «Семейный бюджет»" />
          </div>
          <p className="text-sm text-muted-foreground">
            API: <code>{API_BASE_URL}</code>
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
