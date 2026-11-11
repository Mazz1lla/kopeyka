from datetime import date

from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers

from .models import Account, Budget, Category, ImportBatch, Transaction

User = get_user_model()


class OwnedPrimaryKeyField(serializers.PrimaryKeyRelatedField):
    """PK field that only accepts objects of the current user.

    Without it a user could attach a transaction to someone else's category
    just by guessing an id.
    """

    def get_queryset(self):
        request = self.context["request"]
        return super().get_queryset().filter(owner=request.user)


class RegisterSerializer(serializers.Serializer):
    username = serializers.CharField(max_length=150)
    password = serializers.CharField(write_only=True, min_length=8)

    def validate_username(self, value: str) -> str:
        if User.objects.filter(username__iexact=value).exists():
            raise serializers.ValidationError("Такой логин уже занят")
        return value

    def validate(self, attrs):
        validate_password(attrs["password"], User(username=attrs["username"]))
        return attrs


class AccountSerializer(serializers.ModelSerializer):
    transactions_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = Account
        fields = ["id", "name", "kind", "transactions_count", "created_at"]

    def validate_name(self, value: str) -> str:
        qs = Account.objects.filter(owner=self.context["request"].user, name__iexact=value)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError("Счёт с таким названием уже есть")
        return value


class CategorySerializer(serializers.ModelSerializer):
    transactions_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = Category
        fields = ["id", "name", "kind", "color", "transactions_count"]

    def validate(self, attrs):
        name = attrs.get("name", getattr(self.instance, "name", None))
        kind = attrs.get("kind", getattr(self.instance, "kind", Category.Kind.EXPENSE))
        qs = Category.objects.filter(
            owner=self.context["request"].user, name__iexact=name, kind=kind
        )
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError({"name": "Такая категория уже есть"})
        return attrs


class TransactionSerializer(serializers.ModelSerializer):
    account = OwnedPrimaryKeyField(queryset=Account.objects.all())
    category = OwnedPrimaryKeyField(
        queryset=Category.objects.all(), allow_null=True, required=False
    )

    class Meta:
        model = Transaction
        fields = [
            "id",
            "account",
            "date",
            "amount",
            "description",
            "category",
            "category_source",
            "import_batch",
            "created_at",
        ]
        read_only_fields = ["category_source", "import_batch", "created_at"]

    def validate_amount(self, value):
        if value == 0:
            raise serializers.ValidationError("Сумма не может быть нулевой")
        return value

    def validate(self, attrs):
        category = attrs.get("category", getattr(self.instance, "category", None))
        amount = attrs.get("amount", getattr(self.instance, "amount", None))
        if category is not None and amount is not None:
            is_income = category.kind == Category.Kind.INCOME
            if is_income != (amount > 0):
                raise serializers.ValidationError(
                    {"category": "Категория не подходит по знаку суммы"}
                )
        return attrs


class BulkCategorizeSerializer(serializers.Serializer):
    ids = serializers.ListField(
        child=serializers.IntegerField(min_value=1), allow_empty=False, max_length=5000
    )
    category = OwnedPrimaryKeyField(queryset=Category.objects.all(), allow_null=True)


class ImportBatchSerializer(serializers.ModelSerializer):
    account_name = serializers.CharField(source="account.name", read_only=True)

    class Meta:
        model = ImportBatch
        fields = [
            "id",
            "account",
            "account_name",
            "filename",
            "rows_total",
            "rows_created",
            "rows_duplicates",
            "rows_skipped",
            "rows_categorized",
            "errors",
            "created_at",
        ]
        read_only_fields = fields


class ImportUploadSerializer(serializers.Serializer):
    account = OwnedPrimaryKeyField(queryset=Account.objects.all())
    file = serializers.FileField()

    def validate_file(self, value):
        from django.conf import settings

        if value.size > settings.IMPORT_MAX_FILE_SIZE:
            raise serializers.ValidationError("Файл больше 5 МБ")
        if not value.name.lower().endswith((".csv", ".txt")):
            raise serializers.ValidationError("Нужен CSV-файл")
        return value


class MonthField(serializers.DateField):
    """Accepts '2026-10' or any date and stores the first day of the month."""

    def to_internal_value(self, value):
        if isinstance(value, str) and len(value) == 7:
            value = f"{value}-01"
        parsed: date = super().to_internal_value(value)
        return parsed.replace(day=1)


class BudgetSerializer(serializers.ModelSerializer):
    category = OwnedPrimaryKeyField(queryset=Category.objects.all())
    month = MonthField()

    class Meta:
        model = Budget
        fields = ["id", "category", "month", "limit"]

    def validate(self, attrs):
        category = attrs.get("category", getattr(self.instance, "category", None))
        month = attrs.get("month", getattr(self.instance, "month", None))
        if category and category.kind != Category.Kind.EXPENSE:
            raise serializers.ValidationError({"category": "Бюджет задаётся только для расходов"})
        qs = Budget.objects.filter(
            owner=self.context["request"].user, category=category, month=month
        )
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError(
                {"category": "Бюджет для этой категории на этот месяц уже есть"}
            )
        return attrs
