"""Reports for the dashboard. All aggregation happens in SQL, Python only zero-fills."""

from datetime import date
from decimal import Decimal

from django.db.models import Count, Q, Sum
from django.db.models.functions import TruncMonth

from .models import Budget, Transaction

ZERO = Decimal("0.00")


def month_start(value: date) -> date:
    return value.replace(day=1)


def add_months(value: date, months: int) -> date:
    index = value.year * 12 + value.month - 1 + months
    return date(index // 12, index % 12 + 1, 1)


def _money(value: Decimal | None) -> str:
    return str((value or ZERO).quantize(Decimal("0.01")))


def month_summary(user, month: date) -> dict:
    start = month_start(month)
    end = add_months(start, 1)
    transactions = Transaction.objects.filter(owner=user, date__gte=start, date__lt=end)

    totals = transactions.aggregate(
        income=Sum("amount", filter=Q(amount__gt=0)),
        expense=Sum("amount", filter=Q(amount__lt=0)),
        count=Count("id"),
        uncategorized=Count("id", filter=Q(category__isnull=True)),
    )
    income = totals["income"] or ZERO
    expense = -(totals["expense"] or ZERO)

    by_category_rows = (
        transactions.filter(amount__lt=0)
        .values("category_id", "category__name", "category__color")
        .annotate(total=Sum("amount"), count=Count("id"))
        .order_by("total")
    )
    spent_by_category: dict[int | None, Decimal] = {}
    by_category = []
    for row in by_category_rows:
        spent = -row["total"]
        spent_by_category[row["category_id"]] = spent
        by_category.append(
            {
                "category_id": row["category_id"],
                "name": row["category__name"] or "Без категории",
                "color": row["category__color"] or "#94a3b8",
                "total": _money(spent),
                "count": row["count"],
                "share": round(float(spent / expense), 4) if expense else 0.0,
            }
        )

    budgets = []
    for budget in Budget.objects.filter(owner=user, month=start).select_related("category"):
        spent = spent_by_category.get(budget.category_id, ZERO)
        budgets.append(
            {
                "id": budget.id,
                "category_id": budget.category_id,
                "name": budget.category.name,
                "color": budget.category.color,
                "limit": _money(budget.limit),
                "spent": _money(spent),
                "percent": round(float(spent / budget.limit) * 100, 1),
            }
        )
    budgets.sort(key=lambda b: b["percent"], reverse=True)

    return {
        "month": start.isoformat(),
        "income": _money(income),
        "expense": _money(expense),
        "net": _money(income - expense),
        "transactions_count": totals["count"],
        "uncategorized_count": totals["uncategorized"],
        "by_category": by_category,
        "budgets": budgets,
    }


def monthly_series(user, end_month: date, months: int) -> list[dict]:
    end = add_months(month_start(end_month), 1)
    start = add_months(end, -months)
    rows = (
        Transaction.objects.filter(owner=user, date__gte=start, date__lt=end)
        .annotate(month=TruncMonth("date"))
        .values("month")
        .annotate(
            income=Sum("amount", filter=Q(amount__gt=0)),
            expense=Sum("amount", filter=Q(amount__lt=0)),
        )
        .order_by("month")
    )
    by_month = {month_start(row["month"]): row for row in rows}

    series = []
    for offset in range(months):
        current = add_months(start, offset)
        row = by_month.get(current, {})
        income = row.get("income") or ZERO
        expense = -(row.get("expense") or ZERO)
        series.append(
            {
                "month": current.isoformat(),
                "income": _money(income),
                "expense": _money(expense),
                "net": _money(income - expense),
            }
        )
    return series
