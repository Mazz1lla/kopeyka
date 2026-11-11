from decimal import Decimal

from rest_framework import serializers

from finance.models import Category
from finance.serializers import OwnedPrimaryKeyField

from .engine import CompiledRule, InvalidRule, RuleSpec
from .models import CategoryRule


def _validate_rule(attrs: dict, instance: CategoryRule | None = None) -> None:
    def current(name):
        return attrs.get(name, getattr(instance, name, None))

    amount_min, amount_max = current("amount_min"), current("amount_max")
    if amount_min is not None and amount_max is not None and amount_min > amount_max:
        raise serializers.ValidationError({"amount_max": "Максимум меньше минимума"})

    category = current("category")
    spec = RuleSpec(
        rule_id=0,
        category_id=category.id if category else 0,
        match_type=current("match_type") or CategoryRule.Match.CONTAINS,
        pattern=current("pattern") or "",
    )
    try:
        CompiledRule.compile(spec)
    except InvalidRule as exc:
        raise serializers.ValidationError({"pattern": str(exc)}) from exc


class CategoryRuleSerializer(serializers.ModelSerializer):
    category = OwnedPrimaryKeyField(queryset=Category.objects.all())

    class Meta:
        model = CategoryRule
        fields = [
            "id",
            "category",
            "match_type",
            "pattern",
            "amount_min",
            "amount_max",
            "priority",
            "is_active",
            "created_at",
        ]
        read_only_fields = ["created_at"]

    def validate(self, attrs):
        _validate_rule(attrs, self.instance)
        return attrs


class RuleTestSerializer(serializers.Serializer):
    """A rule that is not saved yet: the UI checks it while the user types."""

    category = OwnedPrimaryKeyField(queryset=Category.objects.all())
    match_type = serializers.ChoiceField(choices=CategoryRule.Match.choices)
    pattern = serializers.CharField(max_length=200)
    amount_min = serializers.DecimalField(
        max_digits=14, decimal_places=2, required=False, allow_null=True, min_value=Decimal("0")
    )
    amount_max = serializers.DecimalField(
        max_digits=14, decimal_places=2, required=False, allow_null=True, min_value=Decimal("0")
    )

    def validate(self, attrs):
        _validate_rule(attrs)
        return attrs

    def to_spec(self) -> RuleSpec:
        data = self.validated_data
        return RuleSpec(
            rule_id=0,
            category_id=data["category"].id,
            match_type=data["match_type"],
            pattern=data["pattern"],
            is_income=data["category"].kind == Category.Kind.INCOME,
            amount_min=data.get("amount_min"),
            amount_max=data.get("amount_max"),
        )


class ApplyRulesSerializer(serializers.Serializer):
    dry_run = serializers.BooleanField(default=True)
    overwrite_manual = serializers.BooleanField(default=False)
