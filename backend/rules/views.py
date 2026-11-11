from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from finance.models import Transaction

from .engine import RuleSet
from .models import CategoryRule
from .serializers import ApplyRulesSerializer, CategoryRuleSerializer, RuleTestSerializer
from .services import apply_rules

TEST_SAMPLE_SIZE = 10


class CategoryRuleViewSet(viewsets.ModelViewSet):
    serializer_class = CategoryRuleSerializer
    pagination_class = None

    def get_queryset(self):
        return CategoryRule.objects.filter(owner=self.request.user).select_related("category")

    def perform_create(self, serializer):
        serializer.save(owner=self.request.user)

    @action(detail=False, methods=["post"])
    def test(self, request):
        """How many transactions would this (unsaved) rule match?"""
        serializer = RuleTestSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        ruleset = RuleSet([serializer.to_spec()])

        matched = 0
        already_in_category = 0
        sample = []
        category_id = serializer.validated_data["category"].id
        rows = Transaction.objects.filter(owner=request.user).values_list(
            "id", "date", "description", "amount", "category_id"
        )
        for tx_id, tx_date, description, amount, current_category in rows.iterator(chunk_size=2000):
            if ruleset.match(description, amount) is None:
                continue
            matched += 1
            if current_category == category_id:
                already_in_category += 1
            if len(sample) < TEST_SAMPLE_SIZE:
                sample.append(
                    {
                        "id": tx_id,
                        "date": tx_date.isoformat(),
                        "description": description,
                        "amount": str(amount),
                    }
                )
        return Response(
            {"matched": matched, "already_in_category": already_in_category, "sample": sample}
        )

    @action(detail=False, methods=["post"])
    def apply(self, request):
        """Re-apply all active rules to the whole history. dry_run=true only counts."""
        serializer = ApplyRulesSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        result = apply_rules(request.user, **serializer.validated_data)
        return Response(result.as_dict())
