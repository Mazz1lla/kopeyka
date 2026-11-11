from decimal import Decimal

import pytest

from rules.engine import InvalidRule, MatchType, RuleSet, RuleSpec, normalize


def spec(rule_id=1, pattern="пятерочка", match_type=MatchType.CONTAINS, **kwargs):
    return RuleSpec(
        rule_id=rule_id,
        category_id=kwargs.pop("category_id", rule_id * 10),
        match_type=match_type,
        pattern=pattern,
        **kwargs,
    )


def test_normalize_handles_case_yo_and_spaces():
    assert normalize("  ПЯТЁРОЧКА   1234\tMOSCOW ") == "пятерочка 1234 moscow"


@pytest.mark.parametrize(
    ("match_type", "pattern", "description", "expected"),
    [
        (MatchType.CONTAINS, "пятерочка", "ПЯТЁРОЧКА 1234", True),
        (MatchType.CONTAINS, "пятерочка", "Перекресток", False),
        (MatchType.STARTS_WITH, "перевод", "Перевод Иван И.", True),
        (MatchType.STARTS_WITH, "перевод", "Возврат: перевод", False),
        (MatchType.REGEX, r"yandex\*taxi|uber", "YANDEX*TAXI MOSCOW", True),
        (MatchType.REGEX, r"^azs \d+", "AZS 42 LUKOIL", True),
        (MatchType.REGEX, r"^azs \d+", "LUKOIL AZS 42", False),
    ],
)
def test_match_types(match_type, pattern, description, expected):
    ruleset = RuleSet([spec(pattern=pattern, match_type=match_type)])
    assert (ruleset.match(description, Decimal("-100")) is not None) is expected


def test_first_rule_by_priority_wins():
    ruleset = RuleSet(
        [
            spec(rule_id=1, pattern="яндекс", priority=50),
            spec(rule_id=2, pattern="яндекс такси", priority=10),
        ]
    )
    assert ruleset.match("Яндекс Такси", Decimal("-300")).rule_id == 2
    assert ruleset.match("Яндекс Маркет", Decimal("-300")).rule_id == 1


def test_same_priority_is_ordered_by_id():
    ruleset = RuleSet([spec(rule_id=7, pattern="кофе"), spec(rule_id=3, pattern="кофе")])
    assert ruleset.match("кофе", Decimal("-1")).rule_id == 3


def test_expense_rule_ignores_income_and_vice_versa():
    expense = RuleSet([spec(pattern="перевод")])
    income = RuleSet([spec(pattern="перевод", is_income=True)])

    assert expense.match("Перевод от Ивана", Decimal("5000")) is None
    assert expense.match("Перевод Ивану", Decimal("-5000")) is not None
    assert income.match("Перевод от Ивана", Decimal("5000")) is not None


def test_amount_range_uses_absolute_value():
    ruleset = RuleSet(
        [spec(pattern="перевод", amount_min=Decimal("1000"), amount_max=Decimal("5000"))]
    )

    assert ruleset.match("перевод", Decimal("-999.99")) is None
    assert ruleset.match("перевод", Decimal("-1000")) is not None
    assert ruleset.match("перевод", Decimal("-5000")) is not None
    assert ruleset.match("перевод", Decimal("-5000.01")) is None


@pytest.mark.parametrize(
    ("pattern", "match_type"),
    [
        ("", MatchType.CONTAINS),
        ("   ", MatchType.CONTAINS),
        ("(unclosed", MatchType.REGEX),
        ("x" * 201, MatchType.CONTAINS),
        ("ok", "glob"),
    ],
)
def test_invalid_rules_are_rejected(pattern, match_type):
    with pytest.raises(InvalidRule):
        RuleSet([spec(pattern=pattern, match_type=match_type)])


def test_empty_ruleset_matches_nothing():
    assert RuleSet([]).match("что угодно", Decimal("-1")) is None
