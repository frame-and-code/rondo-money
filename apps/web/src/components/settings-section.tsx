import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@rondo/ui/components/ui/card';

import type { ReactNode } from 'react';

export function SettingsSection({
  title,
  note,
  children,
}: {
  title: string;
  note: string;
  children: ReactNode;
}) {
  return (
    <Card className="[--card-spacing:--spacing(6)]">
      <CardHeader className="gap-2">
        <CardTitle>
          <h2>{title}</h2>
        </CardTitle>
        <CardDescription>{note}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">{children}</CardContent>
    </Card>
  );
}
