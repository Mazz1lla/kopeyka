"""Starter categories and rules for a new user, so the app isn't empty after sign-up."""

from django.db import transaction

from .models import Account, Category

EXPENSE_CATEGORIES = [
    ("Продукты", "#16a34a"),
    ("Кафе и рестораны", "#ea580c"),
    ("Транспорт", "#2563eb"),
    ("Такси", "#facc15"),
    ("Дом и ЖКХ", "#0d9488"),
    ("Связь и интернет", "#7c3aed"),
    ("Здоровье", "#dc2626"),
    ("Подписки", "#db2777"),
    ("Развлечения", "#9333ea"),
    ("Одежда", "#0891b2"),
    ("Переводы", "#64748b"),
]
INCOME_CATEGORIES = [
    ("Зарплата", "#15803d"),
    ("Кэшбэк и проценты", "#65a30d"),
    ("Прочие доходы", "#4d7c0f"),
]

# (pattern, match type, category name)
STARTER_RULES = [
    ("пятерочка", "contains", "Продукты"),
    ("перекресток", "contains", "Продукты"),
    ("магнит", "contains", "Продукты"),
    ("вкусвилл", "contains", "Продукты"),
    ("кофейня", "contains", "Кафе и рестораны"),
    ("coffee", "contains", "Кафе и рестораны"),
    ("яндекс такси|yandex\\*taxi|uber", "regex", "Такси"),
    ("метро|mosmetro|тройка", "regex", "Транспорт"),
    ("мтс|билайн|ростелеком", "regex", "Связь и интернет"),
    ("аптека", "contains", "Здоровье"),
    ("жку|епд|мосэнергосбыт", "regex", "Дом и ЖКХ"),
    ("yandex plus|kinopoisk|spotify", "regex", "Подписки"),
    ("зарплата", "contains", "Зарплата"),
    ("кэшбэк", "contains", "Кэшбэк и проценты"),
    ("проценты на остаток", "contains", "Кэшбэк и проценты"),
]


@transaction.atomic
def create_starter_data(user) -> None:
    from rules.models import CategoryRule  # rules app depends on finance, not vice versa

    Account.objects.get_or_create(owner=user, name="Основная карта")
    categories = {}
    for kind, items in (
        (Category.Kind.EXPENSE, EXPENSE_CATEGORIES),
        (Category.Kind.INCOME, INCOME_CATEGORIES),
    ):
        for name, color in items:
            category, _ = Category.objects.get_or_create(
                owner=user, name=name, kind=kind, defaults={"color": color}
            )
            categories[name] = category

    CategoryRule.objects.bulk_create(
        CategoryRule(
            owner=user,
            category=categories[category_name],
            pattern=pattern,
            match_type=match_type,
            priority=(index + 1) * 10,
        )
        for index, (pattern, match_type, category_name) in enumerate(STARTER_RULES)
    )
