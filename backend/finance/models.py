from decimal import Decimal

from django.conf import settings
from django.core.validators import MinValueValidator, RegexValidator
from django.db import models
from django.db.models import Q

from rules.engine import normalize

MONEY = {"max_digits": 14, "decimal_places": 2}


class Account(models.Model):
    class Kind(models.TextChoices):
        CARD = "card", "Карта"
        CASH = "cash", "Наличные"
        SAVINGS = "savings", "Накопительный счёт"

    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="accounts"
    )
    name = models.CharField(max_length=100)
    kind = models.CharField(max_length=16, choices=Kind.choices, default=Kind.CARD)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["id"]
        constraints = [
            models.UniqueConstraint(fields=["owner", "name"], name="uniq_account_name_per_owner"),
        ]

    def __str__(self) -> str:
        return self.name


class Category(models.Model):
    class Kind(models.TextChoices):
        EXPENSE = "expense", "Расход"
        INCOME = "income", "Доход"

    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="categories"
    )
    name = models.CharField(max_length=60)
    kind = models.CharField(max_length=10, choices=Kind.choices, default=Kind.EXPENSE)
    color = models.CharField(
        max_length=7,
        default="#64748b",
        validators=[RegexValidator(r"^#[0-9a-fA-F]{6}$", "Цвет в формате #rrggbb")],
    )

    class Meta:
        ordering = ["kind", "name"]
        verbose_name_plural = "categories"
        constraints = [
            models.UniqueConstraint(
                fields=["owner", "name", "kind"], name="uniq_category_name_per_owner"
            ),
        ]

    def __str__(self) -> str:
        return self.name


class ImportBatch(models.Model):
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="imports"
    )
    account = models.ForeignKey(Account, on_delete=models.CASCADE, related_name="imports")
    filename = models.CharField(max_length=255)
    rows_total = models.PositiveIntegerField(default=0)
    rows_created = models.PositiveIntegerField(default=0)
    rows_duplicates = models.PositiveIntegerField(default=0)
    rows_skipped = models.PositiveIntegerField(default=0)  # declined by the bank (FAILED)
    rows_categorized = models.PositiveIntegerField(default=0)
    errors = models.JSONField(default=list, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"{self.filename} ({self.created_at:%Y-%m-%d})"


class Transaction(models.Model):
    class CategorySource(models.TextChoices):
        NONE = "none", "Без категории"
        RULE = "rule", "Правило"
        MANUAL = "manual", "Вручную"

    # owner is denormalized from account: every query is scoped by user, and
    # (owner, date) index is much cheaper than a join through accounts.
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="transactions"
    )
    account = models.ForeignKey(Account, on_delete=models.CASCADE, related_name="transactions")
    date = models.DateField()
    # negative = expense, positive = income
    amount = models.DecimalField(**MONEY)
    description = models.CharField(max_length=255)
    # lowercase, "ё" -> "е", single spaces. Search uses it instead of icontains:
    # SQLite's LIKE is case-insensitive only for ASCII, so "ноут" didn't find "Ноутбук".
    search_text = models.CharField(max_length=255, editable=False, default="")
    category = models.ForeignKey(
        Category,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="transactions",
    )
    category_source = models.CharField(
        max_length=10, choices=CategorySource.choices, default=CategorySource.NONE
    )
    import_batch = models.ForeignKey(
        ImportBatch,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="transactions",
    )
    # sha256 of normalized row; makes re-importing the same statement idempotent
    fingerprint = models.CharField(max_length=64, null=True, blank=True)  # noqa: DJ001 manual rows have none
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-date", "-id"]
        indexes = [
            models.Index(fields=["owner", "date"], name="tx_owner_date_idx"),
            models.Index(fields=["owner", "category", "date"], name="tx_owner_category_date_idx"),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["account", "fingerprint"],
                condition=Q(fingerprint__isnull=False),
                name="uniq_tx_fingerprint_per_account",
            ),
            models.CheckConstraint(condition=~Q(amount=0), name="tx_amount_not_zero"),
        ]

    def __str__(self) -> str:
        return f"{self.date} {self.amount} {self.description}"

    def save(self, *args, **kwargs):
        # bulk_create() skips save(): importers fill search_text themselves
        self.search_text = normalize(self.description)
        super().save(*args, **kwargs)


class Budget(models.Model):
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="budgets"
    )
    category = models.ForeignKey(Category, on_delete=models.CASCADE, related_name="budgets")
    month = models.DateField(help_text="Первое число месяца")
    limit = models.DecimalField(**MONEY, validators=[MinValueValidator(Decimal("1"))])

    class Meta:
        ordering = ["-month", "category__name"]
        constraints = [
            models.UniqueConstraint(
                fields=["owner", "category", "month"], name="uniq_budget_per_month"
            ),
        ]

    def __str__(self) -> str:
        return f"{self.category} {self.month:%Y-%m}: {self.limit}"
