// Money comes from the backend as strings ("1234.50") to avoid float rounding.
export type Money = string

export type Paginated<T> = {
  count: number
  next: string | null
  previous: string | null
  results: T[]
}

export type Account = {
  id: number
  name: string
  kind: 'card' | 'cash' | 'savings'
  transactions_count: number
}

export type CategoryKind = 'expense' | 'income'

export type Category = {
  id: number
  name: string
  kind: CategoryKind
  color: string
  transactions_count: number
}

export type CategorySource = 'none' | 'rule' | 'manual'

export type Transaction = {
  id: number
  account: number
  date: string
  amount: Money
  description: string
  category: number | null
  category_source: CategorySource
  import_batch: number | null
  created_at: string
}

export type ImportBatch = {
  id: number
  account: number
  account_name: string
  filename: string
  rows_total: number
  rows_created: number
  rows_duplicates: number
  rows_skipped: number
  rows_categorized: number
  errors: { line: number; message: string }[]
  created_at: string
}

export type MatchType = 'contains' | 'starts_with' | 'regex'

export type Rule = {
  id: number
  category: number
  match_type: MatchType
  pattern: string
  amount_min: Money | null
  amount_max: Money | null
  priority: number
  is_active: boolean
}

export type RuleDraft = Omit<Rule, 'id' | 'is_active'> & { is_active?: boolean }

export type RuleTestResult = {
  matched: number
  already_in_category: number
  sample: { id: number; date: string; description: string; amount: Money }[]
}

export type ApplyRulesResult = {
  checked: number
  matched: number
  changed: number
  skipped_manual: number
  duration_ms: number
  by_category: { category_id: number; count: number }[]
}

export type Budget = {
  id: number
  category: number
  month: string
  limit: Money
}

export type MonthSummary = {
  month: string
  income: Money
  expense: Money
  net: Money
  transactions_count: number
  uncategorized_count: number
  by_category: {
    category_id: number | null
    name: string
    color: string
    total: Money
    count: number
    share: number
  }[]
  budgets: {
    id: number
    category_id: number
    name: string
    color: string
    limit: Money
    spent: Money
    percent: number
  }[]
}

export type MonthlyPoint = {
  month: string
  income: Money
  expense: Money
  net: Money
}
