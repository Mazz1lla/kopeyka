"""Generate a demo user with ~1.5 years of realistic transactions.

python manage.py seed_demo            # demo / demo-password-2026
python manage.py seed_demo --reset    # recreate from scratch
"""

import random
import time
from datetime import date, timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.db import transaction as db_transaction
from rest_framework.authtoken.models import Token

from finance.defaults import create_starter_data
from finance.models import Account, Budget, Category, Transaction
from rules.engine import normalize
from rules.services import apply_rules

User = get_user_model()

DEMO_USERNAME = "demo"
DEMO_PASSWORD = "demo-password-2026"

# (description template, min, max, times per month)
SPENDING = [
    ("ПЯТЕРОЧКА {n} МОСКВА", 250, 2400, 9),
    ("ПЕРЕКРЕСТОК {n}", 400, 3800, 4),
    ("MAGNIT MM {n}", 150, 1500, 3),
    ("ВКУСВИЛЛ {n}", 300, 2200, 3),
    ("Кофейня Зерно", 180, 520, 6),
    ("COFFEE LIKE {n}", 150, 400, 3),
    ("Яндекс Такси", 250, 1400, 4),
    ("YANDEX*TAXI", 300, 900, 2),
    ("MOSMETRO {n}", 61, 61, 18),
    ("Пополнение карты Тройка", 500, 1000, 1),
    ("АПТЕКА РИГЛА {n}", 200, 3000, 1),
    ("Ресторан Хачапурия", 1200, 4500, 1),
    ("KINOPOISK.RU", 299, 299, 0),
    ("SPORTMASTER {n}", 1500, 8000, 0),
    ("IP SIDOROV A.V.", 300, 2500, 1),  # no rule for this one: stays uncategorized
]
MONTHLY_FIXED = [
    ("МТС мобильная связь", Decimal("650.00"), 5),
    ("Ростелеком интернет", Decimal("750.00"), 7),
    ("ЖКУ Москва ЕПД", Decimal("6400.00"), 12),
    ("YANDEX PLUS", Decimal("399.00"), 20),
]
FRIENDS = ["Иван И.", "Мария К.", "Алексей П.", "Ольга С."]


def month_iter(start: date, end: date):
    current = start.replace(day=1)
    while current <= end:
        yield current
        current = (current + timedelta(days=32)).replace(day=1)


def random_day(rng: random.Random, month: date, until: date) -> date | None:
    last_day = ((month + timedelta(days=32)).replace(day=1) - timedelta(days=1)).day
    day = month.replace(day=rng.randint(1, last_day))
    return day if day <= until else None


class Command(BaseCommand):
    help = "Create demo user with generated transactions"

    def add_arguments(self, parser):
        parser.add_argument("--reset", action="store_true", help="Delete the demo user first")
        parser.add_argument("--months", type=int, default=18)
        parser.add_argument("--seed", type=int, default=42)

    def handle(self, *args, reset: bool, months: int, seed: int, **options):
        started = time.monotonic()
        if reset:
            User.objects.filter(username=DEMO_USERNAME).delete()
        if User.objects.filter(username=DEMO_USERNAME).exists():
            self.stdout.write("Demo user already exists, use --reset to recreate it.")
            return

        rng = random.Random(seed)
        with db_transaction.atomic():
            user = User.objects.create_user(DEMO_USERNAME, password=DEMO_PASSWORD)
            create_starter_data(user)
            Token.objects.get_or_create(user=user)
            card = Account.objects.get(owner=user, name="Основная карта")
            savings = Account.objects.create(
                owner=user, name="Накопительный", kind=Account.Kind.SAVINGS
            )
            transactions = self._generate(rng, user, card, savings, months)
            Transaction.objects.bulk_create(transactions, batch_size=2000)
            self._create_budgets(user)

        result = apply_rules(user, dry_run=False)
        self._fix_some_by_hand(rng, user)

        elapsed = time.monotonic() - started
        self.stdout.write(
            self.style.SUCCESS(
                f"Created {len(transactions)} transactions, {result.changed} categorized by rules "
                f"in {elapsed:.1f}s. Login: {DEMO_USERNAME} / {DEMO_PASSWORD}"
            )
        )

    def _generate(self, rng, user, card, savings, months):
        today = date.today()
        start = (today.replace(day=1) - timedelta(days=31 * (months - 1))).replace(day=1)
        txs: list[Transaction] = []

        def add(account, day, amount, description):
            if day is not None:
                txs.append(
                    Transaction(
                        owner=user,
                        account=account,
                        date=day,
                        amount=Decimal(amount).quantize(Decimal("0.01")),
                        description=description,
                        search_text=normalize(description),
                    )
                )

        salary = Decimal("95000")
        for month in month_iter(start, today):
            for day_of_month, share in ((5, Decimal("0.4")), (20, Decimal("0.6"))):
                day = month.replace(day=day_of_month)
                if day <= today:
                    add(card, day, salary * share, "Зарплата ООО Ромашка")
            salary += rng.choice([0, 0, 0, 5000])  # raises happen sometimes

            for description, low, high, per_month in SPENDING:
                count = max(0, per_month + rng.randint(-2, 2)) if per_month else rng.randint(0, 1)
                for _ in range(count):
                    amount = rng.uniform(low, high)
                    text = description.format(n=rng.randint(1000, 9999))
                    add(card, random_day(rng, month, today), -amount, text)

            for description, amount, day_of_month in MONTHLY_FIXED:
                day = month.replace(day=day_of_month)
                if day <= today:
                    add(card, day, -amount, description)

            for _ in range(rng.randint(1, 4)):
                friend = rng.choice(FRIENDS)
                add(
                    card,
                    random_day(rng, month, today),
                    -rng.randint(3, 50) * 100,
                    f"Перевод {friend}",
                )

            add(card, random_day(rng, month, today), rng.uniform(150, 900), "Кэшбэк за покупки")
            interest_day = month.replace(day=28)
            if interest_day <= today:
                add(savings, interest_day, rng.uniform(800, 1600), "Проценты на остаток")
        return txs

    def _create_budgets(self, user):
        month = date.today().replace(day=1)
        limits = {
            "Продукты": 25000,
            "Кафе и рестораны": 7000,
            "Такси": 4000,
            "Развлечения": 3000,
        }
        categories = Category.objects.filter(owner=user, name__in=limits)
        Budget.objects.bulk_create(
            Budget(owner=user, category=c, month=month, limit=limits[c.name]) for c in categories
        )

    def _fix_some_by_hand(self, rng, user):
        """Imitate a user who categorized transfers to friends manually."""
        transfers = Category.objects.get(owner=user, name="Переводы")
        ids = list(
            Transaction.objects.filter(
                owner=user, description__startswith="Перевод", amount__lt=0
            ).values_list("id", flat=True)
        )
        chosen = rng.sample(ids, k=len(ids) // 2)
        Transaction.objects.filter(id__in=chosen).update(
            category=transfers, category_source=Transaction.CategorySource.MANUAL
        )
