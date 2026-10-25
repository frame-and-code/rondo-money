import { BalancesForm } from '@/components/balances-form';

export const dynamic = 'force-dynamic';

export default function NewBalancesPage() {
  return (
    <main className="relative mx-auto flex min-h-svh w-full max-w-6xl flex-col px-5 pt-5 pb-10 md:justify-center md:px-6 md:py-16">
      <BalancesForm />
    </main>
  );
}
