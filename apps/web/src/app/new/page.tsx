import { NewBudgetForm } from '@/components/new-budget-form';
import { pickNamePlaceholderIndex } from '@/i18n/name-placeholders';

/// The name example is picked per visit. Without this the page is rendered at build time and
/// every visitor for the life of the deployment sees the same one.
export const dynamic = 'force-dynamic';

export default function NewBudgetPage() {
  return (
    <main className="relative mx-auto flex min-h-svh w-full max-w-6xl flex-col px-5 pt-5 pb-10 md:justify-center md:px-6 md:py-16">
      <NewBudgetForm nameIndex={pickNamePlaceholderIndex()} />
    </main>
  );
}
