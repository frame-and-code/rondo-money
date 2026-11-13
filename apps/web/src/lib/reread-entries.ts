import {
  accountsControllerListQueryKey,
  budgetViewControllerReadQueryKey,
  transactionsControllerListQueryKey,
  transactionsControllerPayeesQueryKey,
} from '@rondo/api-client/react-query';
import { type QueryClient } from '@tanstack/react-query';

export async function rereadEntries(queryClient: QueryClient): Promise<void> {
  const [view] = budgetViewControllerReadQueryKey({ query: { month: '' } });
  const [entries] = transactionsControllerListQueryKey();
  const [known] = transactionsControllerPayeesQueryKey();

  await queryClient.invalidateQueries({ queryKey: accountsControllerListQueryKey() });
  await queryClient.invalidateQueries({ queryKey: [{ _id: view._id }] });
  await queryClient.invalidateQueries({ queryKey: [{ _id: entries._id }] });
  await queryClient.invalidateQueries({ queryKey: [{ _id: known._id }] });
}
