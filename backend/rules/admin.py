from django.contrib import admin

from .models import CategoryRule


@admin.register(CategoryRule)
class CategoryRuleAdmin(admin.ModelAdmin):
    list_display = ["pattern", "match_type", "category", "priority", "is_active", "owner"]
    list_filter = ["match_type", "is_active"]
    search_fields = ["pattern"]
