from django.contrib import admin

from .models import Account, Budget, Category, ImportBatch, Transaction


@admin.register(Account)
class AccountAdmin(admin.ModelAdmin):
    list_display = ["name", "owner", "kind", "created_at"]
    list_filter = ["kind"]


@admin.register(Category)
class CategoryAdmin(admin.ModelAdmin):
    list_display = ["name", "owner", "kind", "color"]
    list_filter = ["kind"]
    search_fields = ["name"]


@admin.register(Transaction)
class TransactionAdmin(admin.ModelAdmin):
    list_display = ["date", "amount", "description", "category", "category_source", "account"]
    list_filter = ["category_source", "account"]
    search_fields = ["description"]
    date_hierarchy = "date"
    raw_id_fields = ["account", "category", "import_batch"]
    list_select_related = ["category", "account"]


@admin.register(ImportBatch)
class ImportBatchAdmin(admin.ModelAdmin):
    list_display = ["filename", "owner", "account", "rows_created", "rows_duplicates", "created_at"]


@admin.register(Budget)
class BudgetAdmin(admin.ModelAdmin):
    list_display = ["category", "month", "limit", "owner"]
