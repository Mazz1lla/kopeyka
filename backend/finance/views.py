from datetime import date

from django.contrib.auth import get_user_model
from django.db import transaction as db_transaction
from django.db.models import Count
from rest_framework import mixins, status, viewsets
from rest_framework.authtoken.models import Token
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from . import analytics
from .cache import bump_analytics_version, cached_report
from .defaults import create_starter_data
from .filters import TransactionFilter
from .importers import StatementError
from .models import Account, Budget, Category, ImportBatch, Transaction
from .serializers import (
    AccountSerializer,
    BudgetSerializer,
    BulkCategorizeSerializer,
    CategorySerializer,
    ImportBatchSerializer,
    ImportUploadSerializer,
    RegisterSerializer,
    TransactionSerializer,
)
from .services import import_statement

User = get_user_model()


class RegisterView(APIView):
    permission_classes = [AllowAny]
    authentication_classes: list = []

    def post(self, request):
        serializer = RegisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        with db_transaction.atomic():
            user = User.objects.create_user(**serializer.validated_data)
            create_starter_data(user)
            token = Token.objects.create(user=user)
        return Response({"token": token.key}, status=status.HTTP_201_CREATED)


class MeView(APIView):
    def get(self, request):
        return Response({"id": request.user.id, "username": request.user.username})


class OwnedViewSetMixin:
    """Scopes every queryset by request.user and bumps analytics on writes."""

    affects_analytics = True

    def get_queryset(self):
        return super().get_queryset().filter(owner=self.request.user)

    def perform_create(self, serializer):
        serializer.save(owner=self.request.user)
        self._changed()

    def perform_update(self, serializer):
        serializer.save()
        self._changed()

    def perform_destroy(self, instance):
        instance.delete()
        self._changed()

    def _changed(self):
        if self.affects_analytics:
            bump_analytics_version(self.request.user.id)


class AccountViewSet(OwnedViewSetMixin, viewsets.ModelViewSet):
    queryset = Account.objects.annotate(transactions_count=Count("transactions"))
    serializer_class = AccountSerializer
    pagination_class = None


class CategoryViewSet(OwnedViewSetMixin, viewsets.ModelViewSet):
    queryset = Category.objects.annotate(transactions_count=Count("transactions"))
    serializer_class = CategorySerializer
    pagination_class = None
    filterset_fields = ["kind"]

    def perform_destroy(self, instance):
        # FK is SET_NULL, but category_source must be reset too,
        # otherwise the transaction looks "manually categorized" into nothing.
        with db_transaction.atomic():
            instance.transactions.update(category_source=Transaction.CategorySource.NONE)
            super().perform_destroy(instance)


class TransactionViewSet(OwnedViewSetMixin, viewsets.ModelViewSet):
    queryset = Transaction.objects.all()
    serializer_class = TransactionSerializer
    filterset_class = TransactionFilter
    ordering_fields = ["date", "amount", "description"]
    ordering = ["-date", "-id"]

    @staticmethod
    def _source_for(category) -> str:
        if category is None:
            return Transaction.CategorySource.NONE
        return Transaction.CategorySource.MANUAL

    def perform_create(self, serializer):
        category = serializer.validated_data.get("category")
        serializer.save(owner=self.request.user, category_source=self._source_for(category))
        self._changed()

    def perform_update(self, serializer):
        extra = {}
        if "category" in serializer.validated_data:
            extra["category_source"] = self._source_for(serializer.validated_data["category"])
        serializer.save(**extra)
        self._changed()

    @action(detail=False, methods=["post"], url_path="bulk-categorize")
    def bulk_categorize(self, request):
        serializer = BulkCategorizeSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        category = serializer.validated_data["category"]
        queryset = self.get_queryset().filter(id__in=serializer.validated_data["ids"])
        if category is not None:
            sign_filter = (
                {"amount__gt": 0} if category.kind == Category.Kind.INCOME else {"amount__lt": 0}
            )
            queryset = queryset.filter(**sign_filter)
        updated = queryset.update(category=category, category_source=self._source_for(category))
        if updated:
            self._changed()
        return Response({"updated": updated})


class ImportViewSet(
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.CreateModelMixin,
    viewsets.GenericViewSet,
):
    queryset = ImportBatch.objects.select_related("account")
    serializer_class = ImportBatchSerializer

    def get_queryset(self):
        return super().get_queryset().filter(owner=self.request.user)

    def create(self, request, *args, **kwargs):
        upload = ImportUploadSerializer(data=request.data, context={"request": request})
        upload.is_valid(raise_exception=True)
        file = upload.validated_data["file"]
        try:
            batch = import_statement(
                request.user, upload.validated_data["account"], file.name, file.read()
            )
        except StatementError as exc:
            raise ValidationError({"file": str(exc)}) from exc
        return Response(ImportBatchSerializer(batch).data, status=status.HTTP_201_CREATED)


class BudgetViewSet(OwnedViewSetMixin, viewsets.ModelViewSet):
    queryset = Budget.objects.select_related("category")
    serializer_class = BudgetSerializer
    pagination_class = None
    filterset_fields = ["month", "category"]


def _parse_month(value: str | None) -> date:
    if not value:
        return date.today().replace(day=1)
    try:
        return date.fromisoformat(f"{value[:7]}-01")
    except ValueError as exc:
        raise ValidationError({"month": "Формат месяца: ГГГГ-ММ"}) from exc


class AnalyticsViewSet(viewsets.ViewSet):
    @action(detail=False, methods=["get"])
    def summary(self, request):
        month = _parse_month(request.query_params.get("month"))
        data = cached_report(
            request.user.id,
            "summary",
            month.isoformat(),
            lambda: analytics.month_summary(request.user, month),
        )
        return Response(data)

    @action(detail=False, methods=["get"])
    def monthly(self, request):
        end_month = _parse_month(request.query_params.get("month"))
        try:
            months = int(request.query_params.get("months", 12))
        except ValueError as exc:
            raise ValidationError({"months": "Нужно целое число"}) from exc
        if not 1 <= months <= 36:
            raise ValidationError({"months": "От 1 до 36"})
        data = cached_report(
            request.user.id,
            "monthly",
            f"{end_month.isoformat()}:{months}",
            lambda: analytics.monthly_series(request.user, end_month, months),
        )
        return Response(data)
