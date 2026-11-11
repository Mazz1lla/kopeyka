from datetime import date
from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from django.core.cache import cache
from rest_framework.test import APIClient

from finance.models import Account, Category, Transaction

User = get_user_model()


@pytest.fixture(autouse=True)
def _clear_cache():
    cache.clear()
    yield
    cache.clear()


@pytest.fixture
def user(db):
    return User.objects.create_user("alice", password="very-secret-pass")


@pytest.fixture
def other_user(db):
    return User.objects.create_user("bob", password="very-secret-pass")


@pytest.fixture
def api(user):
    client = APIClient()
    client.force_authenticate(user)
    return client


@pytest.fixture
def account(user):
    return Account.objects.create(owner=user, name="Карта")


@pytest.fixture
def make_category(user):
    def factory(name="Продукты", kind=Category.Kind.EXPENSE, owner=None):
        return Category.objects.create(owner=owner or user, name=name, kind=kind)

    return factory


@pytest.fixture
def make_tx(user, account):
    def factory(amount, description="ПЯТЕРОЧКА 123", day=date(2026, 10, 15), **kwargs):
        return Transaction.objects.create(
            owner=kwargs.pop("owner", user),
            account=kwargs.pop("account", account),
            date=day,
            amount=Decimal(str(amount)),
            description=description,
            **kwargs,
        )

    return factory
