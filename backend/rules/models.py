from decimal import Decimal

from django.conf import settings
from django.core.validators import MinValueValidator
from django.db import models
from django.db.models import F, Q

from finance.models import MONEY, Category

from .engine import MatchType, RuleSpec


class CategoryRule(models.Model):
    class Match(models.TextChoices):
        CONTAINS = MatchType.CONTAINS, "Содержит"
        STARTS_WITH = MatchType.STARTS_WITH, "Начинается с"
        REGEX = MatchType.REGEX, "Регулярное выражение"

    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="category_rules"
    )
    category = models.ForeignKey(Category, on_delete=models.CASCADE, related_name="rules")
    match_type = models.CharField(max_length=16, choices=Match.choices, default=Match.CONTAINS)
    pattern = models.CharField(max_length=200)
    amount_min = models.DecimalField(
        **MONEY, null=True, blank=True, validators=[MinValueValidator(Decimal("0"))]
    )
    amount_max = models.DecimalField(
        **MONEY, null=True, blank=True, validators=[MinValueValidator(Decimal("0"))]
    )
    priority = models.PositiveIntegerField(default=100)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["priority", "id"]
        constraints = [
            models.CheckConstraint(
                condition=Q(amount_min__isnull=True)
                | Q(amount_max__isnull=True)
                | Q(amount_min__lte=F("amount_max")),
                name="rule_amount_range_valid",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.get_match_type_display()} «{self.pattern}» → {self.category}"

    def to_spec(self) -> RuleSpec:
        return RuleSpec(
            rule_id=self.pk or 0,
            category_id=self.category_id,
            match_type=self.match_type,
            pattern=self.pattern,
            is_income=self.category.kind == Category.Kind.INCOME,
            amount_min=self.amount_min,
            amount_max=self.amount_max,
            priority=self.priority,
        )
