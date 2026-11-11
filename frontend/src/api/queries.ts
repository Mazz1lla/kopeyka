import { useQuery } from '@tanstack/react-query'

import { api } from './client'
import type { Account, Category } from './types'

export const queryKeys = {
  accounts: ['accounts'] as const,
  categories: ['categories'] as const,
  transactions: ['transactions'] as const,
  analytics: ['analytics'] as const,
  rules: ['rules'] as const,
  budgets: ['budgets'] as const,
  imports: ['imports'] as const,
}

/**
 * Everything that changes transactions also changes analytics and category
 * counters, so mutations invalidate this whole group at once.
 */
export const transactionDependentKeys = [
  queryKeys.transactions,
  queryKeys.analytics,
  queryKeys.categories,
  queryKeys.accounts,
]

export function useAccounts() {
  return useQuery({
    queryKey: queryKeys.accounts,
    queryFn: () => api<Account[]>('/accounts/'),
    staleTime: 60_000,
  })
}

export function useCategories() {
  return useQuery({
    queryKey: queryKeys.categories,
    queryFn: () => api<Category[]>('/categories/'),
    staleTime: 60_000,
  })
}
