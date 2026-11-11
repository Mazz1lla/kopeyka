import type { Category, CategoryKind } from '../api/types'

export function CategoryName({ category }: { category: Pick<Category, 'name' | 'color'> | null }) {
  if (!category) return <span className="text-muted">без категории</span>
  return (
    <span>
      <span className="swatch" style={{ background: category.color }} />
      {category.name}
    </span>
  )
}

type SelectProps = {
  categories: Category[]
  value: number | null
  onChange: (value: number | null) => void
  // показывать только категории с подходящим знаком суммы
  kind?: CategoryKind
  emptyLabel?: string
  className?: string
  'aria-label'?: string
}

export function CategorySelect({
  categories,
  value,
  onChange,
  kind,
  emptyLabel = '—',
  className,
  ...rest
}: SelectProps) {
  const groups: { kind: CategoryKind; label: string }[] = [
    { kind: 'expense', label: 'Расходы' },
    { kind: 'income', label: 'Доходы' },
  ]
  return (
    <select
      className={className ?? 'form-select'}
      value={value ?? ''}
      onChange={(event) => onChange(event.target.value ? Number(event.target.value) : null)}
      {...rest}
    >
      <option value="">{emptyLabel}</option>
      {groups
        .filter((group) => !kind || group.kind === kind)
        .map((group) => (
          <optgroup key={group.kind} label={group.label}>
            {categories
              .filter((category) => category.kind === group.kind)
              .map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
          </optgroup>
        ))}
    </select>
  )
}
