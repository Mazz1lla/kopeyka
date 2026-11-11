from django.contrib import admin
from django.urls import include, path
from rest_framework.authtoken.views import obtain_auth_token
from rest_framework.routers import DefaultRouter

from finance import views as finance_views
from rules.views import CategoryRuleViewSet

router = DefaultRouter()
router.register("accounts", finance_views.AccountViewSet, basename="account")
router.register("categories", finance_views.CategoryViewSet, basename="category")
router.register("transactions", finance_views.TransactionViewSet, basename="transaction")
router.register("imports", finance_views.ImportViewSet, basename="import")
router.register("budgets", finance_views.BudgetViewSet, basename="budget")
router.register("analytics", finance_views.AnalyticsViewSet, basename="analytics")
router.register("rules", CategoryRuleViewSet, basename="rule")

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/auth/token/", obtain_auth_token, name="auth-token"),
    path("api/auth/register/", finance_views.RegisterView.as_view(), name="auth-register"),
    path("api/auth/me/", finance_views.MeView.as_view(), name="auth-me"),
    path("api/", include(router.urls)),
]
