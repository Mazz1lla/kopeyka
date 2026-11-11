from datetime import date
from decimal import Decimal

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.authtoken.models import Token

from finance.models import Account, Category, Transaction
from rules.models import CategoryRule

pytestmark = pytest.mark.django_db

STATEMENT = (
    "Дата операции;Сумма операции;Описание\n"
    "01.10.2026;-250,00;Кофейня Зерно\n"
    "01.10.2026;-250,00;Кофейня Зерно\n"
    "02.10.2026;-1 500,00;IP SIDOROV\n"
    "05.10.2026;90 000,00;Зарплата ООО Ромашка\n"
    "06.10.2026;-x;битая строка\n"
)


def upload(api, account, content=STATEMENT, name="statement.csv"):
    file = SimpleUploadedFile(name, content.encode("cp1251"), content_type="text/csv")
    return api.post("/api/imports/", {"account": account.id, "file": file}, format="multipart")


# --- auth -------------------------------------------------------------------


def test_register_creates_token_and_starter_data(client):
    response = client.post(
        "/api/auth/register/",
        {"username": "newbie", "password": "correct-horse-battery"},
        content_type="application/json",
    )
    assert response.status_code == 201
    token = Token.objects.get(key=response.json()["token"])
    assert token.user.accounts.count() == 1
    assert token.user.categories.count() > 5
    assert CategoryRule.objects.filter(owner=token.user).exists()


def test_register_rejects_weak_password_and_taken_username(client, user):
    weak = client.post(
        "/api/auth/register/",
        {"username": "newbie", "password": "12345678"},
        content_type="application/json",
    )
    taken = client.post(
        "/api/auth/register/",
        {"username": "ALICE", "password": "correct-horse-battery"},
        content_type="application/json",
    )
    assert weak.status_code == 400
    assert taken.status_code == 400 and "username" in taken.json()


def test_anonymous_has_no_access(client):
    assert client.get("/api/transactions/").status_code == 401


# --- data isolation ---------------------------------------------------------


def test_user_does_not_see_foreign_transactions(api, other_user, make_tx):
    foreign_account = Account.objects.create(owner=other_user, name="Чужая")
    foreign = make_tx(-100, owner=other_user, account=foreign_account)
    mine = make_tx(-200)

    ids = [row["id"] for row in api.get("/api/transactions/").json()["results"]]

    assert ids == [mine.id]
    assert api.get(f"/api/transactions/{foreign.id}/").status_code == 404
    assert api.delete(f"/api/transactions/{foreign.id}/").status_code == 404


def test_cannot_use_foreign_category_or_account(api, account, other_user, make_category):
    foreign_category = make_category("Чужая", owner=other_user)
    foreign_account = Account.objects.create(owner=other_user, name="Чужая")

    response = api.post(
        "/api/transactions/",
        {
            "account": foreign_account.id,
            "date": "2026-10-01",
            "amount": "-100",
            "description": "x",
            "category": foreign_category.id,
        },
        format="json",
    )
    assert response.status_code == 400
    assert set(response.json()) == {"account", "category"}


# --- transactions -------------------------------------------------------------


def test_manual_category_change_marks_source(api, make_tx, make_category):
    tx = make_tx(-100)
    food = make_category()

    response = api.patch(f"/api/transactions/{tx.id}/", {"category": food.id}, format="json")

    assert response.status_code == 200
    assert response.json()["category_source"] == "manual"
    response = api.patch(f"/api/transactions/{tx.id}/", {"category": None}, format="json")
    assert response.json()["category_source"] == "none"


def test_income_category_is_rejected_for_expense(api, make_tx, make_category):
    tx = make_tx(-100)
    salary = make_category("Зарплата", kind=Category.Kind.INCOME)

    response = api.patch(f"/api/transactions/{tx.id}/", {"category": salary.id}, format="json")

    assert response.status_code == 400


def test_bulk_categorize_skips_wrong_sign(api, make_tx, make_category):
    expense, income = make_tx(-100), make_tx(500, description="Возврат")
    food = make_category()

    response = api.post(
        "/api/transactions/bulk-categorize/",
        {"ids": [expense.id, income.id], "category": food.id},
        format="json",
    )

    assert response.json() == {"updated": 1}
    income.refresh_from_db()
    assert income.category is None


def test_filters(api, make_tx, make_category):
    food = make_category()
    make_tx(-100, category=food)
    big = make_tx(-5000, description="Ноутбук")
    make_tx(7000, description="Зарплата")

    def ids(query):
        return {row["id"] for row in api.get(f"/api/transactions/?{query}").json()["results"]}

    assert ids("uncategorized=true&kind=expense") == {big.id}
    assert len(ids("amount_min=4000")) == 2  # absolute value: -5000 and 7000
    assert ids("search=ноут") == {big.id}


def test_transaction_list_query_count_does_not_grow(api, make_tx, django_assert_max_num_queries):
    for i in range(30):
        make_tx(-10 - i)
    with django_assert_max_num_queries(4):  # auth + count + page (+ savepoint slack)
        response = api.get("/api/transactions/")
    assert response.json()["count"] == 30


def test_deleting_category_resets_category_source(api, make_tx, make_category):
    food = make_category()
    tx = make_tx(-100, category=food, category_source=Transaction.CategorySource.MANUAL)

    assert api.delete(f"/api/categories/{food.id}/").status_code == 204

    tx.refresh_from_db()
    assert (tx.category, tx.category_source) == (None, "none")


# --- import -------------------------------------------------------------------


def test_import_is_idempotent_and_categorizes_by_rules(api, user, account, make_category):
    cafe = make_category("Кафе")
    CategoryRule.objects.create(owner=user, category=cafe, pattern="кофейня")

    first = upload(api, account)
    second = upload(api, account)

    assert first.status_code == 201, first.json()
    body = first.json()
    assert (body["rows_total"], body["rows_created"], body["rows_categorized"]) == (5, 4, 2)
    assert body["errors"][0]["line"] == 6
    assert second.json()["rows_created"] == 0
    assert second.json()["rows_duplicates"] == 4
    assert Transaction.objects.filter(owner=user).count() == 4


def test_import_rejects_foreign_account_and_bad_files(api, other_user, account):
    foreign = Account.objects.create(owner=other_user, name="Чужая")
    assert upload(api, foreign).status_code == 400
    assert upload(api, account, name="photo.jpg").status_code == 400
    bad = upload(api, account, content="a;b\n1;2\n")
    assert bad.status_code == 400 and "file" in bad.json()


# --- rules --------------------------------------------------------------------


def test_apply_rules_dry_run_and_manual_protection(api, user, make_tx, make_category):
    cafe, other = make_category("Кафе"), make_category("Другое")
    CategoryRule.objects.create(owner=user, category=cafe, pattern="кофейня")
    auto = make_tx(-200, description="Кофейня Зерно")
    manual = make_tx(
        -300,
        description="Кофейня Зерно",
        category=other,
        category_source=Transaction.CategorySource.MANUAL,
    )

    preview = api.post("/api/rules/apply/", {"dry_run": True}, format="json").json()
    auto.refresh_from_db()
    assert preview["changed"] == 1 and preview["skipped_manual"] == 1
    assert auto.category is None

    api.post("/api/rules/apply/", {"dry_run": False}, format="json")
    auto.refresh_from_db()
    manual.refresh_from_db()
    assert (auto.category, auto.category_source) == (cafe, "rule")
    assert manual.category == other

    api.post("/api/rules/apply/", {"dry_run": False, "overwrite_manual": True}, format="json")
    manual.refresh_from_db()
    assert manual.category == cafe


def test_rule_test_endpoint_counts_matches(api, make_tx, make_category):
    cafe = make_category("Кафе")
    make_tx(-200, description="Кофейня Зерно")
    make_tx(-200, description="КОФЕЙНЯ у дома", category=cafe)
    make_tx(-200, description="Пятерочка")

    response = api.post(
        "/api/rules/test/",
        {"category": cafe.id, "match_type": "contains", "pattern": "кофейня"},
        format="json",
    )

    assert response.json()["matched"] == 2
    assert response.json()["already_in_category"] == 1


def test_invalid_regex_is_a_validation_error(api, make_category):
    response = api.post(
        "/api/rules/",
        {"category": make_category().id, "match_type": "regex", "pattern": "(oops"},
        format="json",
    )
    assert response.status_code == 400
    assert "pattern" in response.json()


# --- analytics ----------------------------------------------------------------


def test_month_summary_and_budget_progress(api, user, make_tx, make_category):
    food = make_category()
    make_tx(-1000, category=food, day=date(2026, 10, 1))
    make_tx(-500, day=date(2026, 10, 31))
    make_tx(3000, description="Зарплата", day=date(2026, 10, 5))
    make_tx(-999, day=date(2026, 11, 1))  # next month, must not be counted
    api.post("/api/budgets/", {"category": food.id, "month": "2026-10", "limit": "4000"})

    data = api.get("/api/analytics/summary/?month=2026-10").json()

    assert (data["income"], data["expense"], data["net"]) == ("3000.00", "1500.00", "1500.00")
    assert data["uncategorized_count"] == 2
    assert data["by_category"][0]["name"] == "Продукты"
    assert data["budgets"][0]["percent"] == 25.0


def test_summary_cache_is_invalidated_on_write(api, make_tx, account):
    make_tx(-100, day=date(2026, 10, 1))
    assert api.get("/api/analytics/summary/?month=2026-10").json()["expense"] == "100.00"

    api.post(
        "/api/transactions/",
        {"account": account.id, "date": "2026-10-02", "amount": "-50", "description": "x"},
        format="json",
    )

    assert api.get("/api/analytics/summary/?month=2026-10").json()["expense"] == "150.00"


def test_monthly_series_is_zero_filled(api, make_tx):
    make_tx(-100, day=date(2026, 8, 10))
    make_tx(-300, day=date(2026, 10, 10))

    data = api.get("/api/analytics/monthly/?month=2026-10&months=3").json()

    assert [(m["month"], m["expense"]) for m in data] == [
        ("2026-08-01", "100.00"),
        ("2026-09-01", "0.00"),
        ("2026-10-01", "300.00"),
    ]


@pytest.mark.parametrize("query", ["month=10-2026", "months=0", "months=abc"])
def test_analytics_validates_params(api, query):
    assert api.get(f"/api/analytics/monthly/?{query}").status_code == 400


def test_budget_month_is_normalized(api, make_category):
    response = api.post(
        "/api/budgets/",
        {"category": make_category().id, "month": "2026-10-17", "limit": "100"},
        format="json",
    )
    assert response.json()["month"] == "2026-10-01"
    assert Decimal(response.json()["limit"]) == Decimal("100")
