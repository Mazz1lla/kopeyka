import django_filters
from django.db.models import Q

from rules.engine import normalize

from .models import Transaction


class TransactionFilter(django_filters.FilterSet):
    date_from = django_filters.DateFilter(field_name="date", lookup_expr="gte")
    date_to = django_filters.DateFilter(field_name="date", lookup_expr="lte")
    amount_min = django_filters.NumberFilter(method="filter_amount_min")
    amount_max = django_filters.NumberFilter(method="filter_amount_max")
    uncategorized = django_filters.BooleanFilter(field_name="category", lookup_expr="isnull")
    kind = django_filters.ChoiceFilter(
        choices=(("expense", "expense"), ("income", "income")), method="filter_kind"
    )
    search = django_filters.CharFilter(method="filter_search")

    class Meta:
        model = Transaction
        fields = ["account", "category", "category_source", "import_batch"]

    # amount filters work with the absolute value: "from 1000" means
    # "1000 RUB or more", both for expenses and income.
    def filter_amount_min(self, queryset, name, value):
        return queryset.filter(Q(amount__gte=value) | Q(amount__lte=-value))

    def filter_amount_max(self, queryset, name, value):
        return queryset.filter(amount__gte=-value, amount__lte=value)

    def filter_search(self, queryset, name, value):
        return queryset.filter(search_text__contains=normalize(value))

    def filter_kind(self, queryset, name, value):
        if value == "income":
            return queryset.filter(amount__gt=0)
        return queryset.filter(amount__lt=0)
