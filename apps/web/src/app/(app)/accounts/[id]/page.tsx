'use client';

import { useParams } from 'next/navigation';

import { MoneyFlow } from '@/components/money-flow';

export default function AccountPage() {
  const params = useParams<{ id: string }>();

  return <MoneyFlow accountId={params.id} />;
}
