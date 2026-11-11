"""Matching transactions against user-defined categorization rules.

Plain Python without Django: the same RuleSet is used when importing a
statement, when re-applying rules to the whole history and when testing a
rule in the UI, so it is worth keeping it small and well tested.
"""

from __future__ import annotations

import re
from collections.abc import Iterable
from dataclasses import dataclass, field
from decimal import Decimal

_SPACES = re.compile(r"\s+")


def normalize(text: str) -> str:
    """Bank descriptions are noisy: 'ПЯТЁРОЧКА  1234 MOSCOW' -> 'пятерочка 1234 moscow'."""
    return _SPACES.sub(" ", text.lower().replace("ё", "е")).strip()


class MatchType:
    CONTAINS = "contains"
    STARTS_WITH = "starts_with"
    REGEX = "regex"

    choices = (CONTAINS, STARTS_WITH, REGEX)


class InvalidRule(ValueError):
    pass


MAX_PATTERN_LENGTH = 200


@dataclass(frozen=True)
class RuleSpec:
    rule_id: int
    category_id: int
    match_type: str
    pattern: str
    # Expense rules match only negative amounts, income rules only positive ones,
    # so "перевод" can't put a salary into "Переводы друзьям".
    is_income: bool = False
    amount_min: Decimal | None = None  # compared with abs(amount)
    amount_max: Decimal | None = None
    priority: int = 100


@dataclass
class CompiledRule:
    spec: RuleSpec
    _needle: str = field(default="", repr=False)
    _regex: re.Pattern[str] | None = field(default=None, repr=False)

    @classmethod
    def compile(cls, spec: RuleSpec) -> CompiledRule:
        pattern = spec.pattern.strip()
        if not pattern:
            raise InvalidRule("Шаблон не может быть пустым")
        if len(pattern) > MAX_PATTERN_LENGTH:
            raise InvalidRule(f"Шаблон длиннее {MAX_PATTERN_LENGTH} символов")
        if spec.match_type not in MatchType.choices:
            raise InvalidRule(f"Неизвестный тип правила: {spec.match_type}")

        if spec.match_type == MatchType.REGEX:
            try:
                regex = re.compile(normalize(pattern), re.IGNORECASE)
            except re.error as exc:
                raise InvalidRule(f"Ошибка в регулярном выражении: {exc}") from exc
            return cls(spec=spec, _regex=regex)
        return cls(spec=spec, _needle=normalize(pattern))

    def matches(self, normalized_description: str, amount: Decimal) -> bool:
        spec = self.spec
        if spec.is_income != (amount > 0):
            return False
        absolute = abs(amount)
        if spec.amount_min is not None and absolute < spec.amount_min:
            return False
        if spec.amount_max is not None and absolute > spec.amount_max:
            return False

        if self._regex is not None:
            return self._regex.search(normalized_description) is not None
        if spec.match_type == MatchType.STARTS_WITH:
            return normalized_description.startswith(self._needle)
        return self._needle in normalized_description


class RuleSet:
    """Ordered rules, the first matching one wins (lower priority value first).

    Complexity is O(rules) per transaction. With tens of rules and thousands of
    transactions it takes milliseconds; see README for when it stops being enough.
    """

    def __init__(self, specs: Iterable[RuleSpec]):
        ordered = sorted(specs, key=lambda s: (s.priority, s.rule_id))
        self._rules = [CompiledRule.compile(spec) for spec in ordered]

    def __len__(self) -> int:
        return len(self._rules)

    def match(self, description: str, amount: Decimal) -> RuleSpec | None:
        text = normalize(description)
        for rule in self._rules:
            if rule.matches(text, amount):
                return rule.spec
        return None
