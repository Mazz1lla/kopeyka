import logging
import time
from collections import Counter, defaultdict
from dataclasses import dataclass, field

from django.db import transaction as db_transaction

from finance.cache import bump_analytics_version
from finance.models import Transaction

from .engine import RuleSet, RuleSpec
from .models import CategoryRule

logger = logging.getLogger(__name__)

BATCH_SIZE = 900  # also keeps IN (...) below SQLite's variable limit
SAMPLE_SIZE = 20


def build_ruleset(user, extra: RuleSpec | None = None, only_extra: bool = False) -> RuleSet:
    specs: list[RuleSpec] = []
    if not only_extra:
        rules = CategoryRule.objects.filter(owner=user, is_active=True).select_related("category")
        specs = [rule.to_spec() for rule in rules]
    if extra is not None:
        specs.append(extra)
    return RuleSet(specs)


@dataclass
class ApplyResult:
    checked: int = 0
    matched: int = 0
    changed: int = 0
    skipped_manual: int = 0
    duration_ms: int = 0
    by_category: Counter = field(default_factory=Counter)
    sample: list[dict] = field(default_factory=list)

    def as_dict(self) -> dict:
        return {
            "checked": self.checked,
            "matched": self.matched,
            "changed": self.changed,
            "skipped_manual": self.skipped_manual,
            "duration_ms": self.duration_ms,
            "by_category": [
                {"category_id": cid, "count": n} for cid, n in self.by_category.most_common()
            ],
            "sample": self.sample,
        }


def apply_rules(user, *, dry_run: bool, overwrite_manual: bool = False) -> ApplyResult:
    """Re-categorize the whole history of a user.

    Manually categorized transactions are not touched unless overwrite_manual
    is passed: a user fixing a category by hand must not see it reverted.
    Transactions that match no rule keep their current category.
    """
    started = time.monotonic()
    ruleset = build_ruleset(user)
    result = ApplyResult()

    # values_list instead of model instances: building 40k deferred models was
    # ~10x slower than the matching itself.
    rows = Transaction.objects.filter(owner=user).values_list(
        "id", "description", "amount", "category_id", "category_source"
    )
    # category_id -> ids of transactions to move there. One UPDATE per category
    # instead of bulk_update(): bulk_update builds a huge CASE WHEN per batch and
    # took ~64s on 41k transactions (SQLite), grouped UPDATEs take a few seconds.
    to_update: dict[int, list[int]] = defaultdict(list)

    for tx_id, description, amount, category_id, source in rows.iterator(chunk_size=2000):
        result.checked += 1
        spec = ruleset.match(description, amount)
        if spec is None:
            continue
        result.matched += 1
        if category_id == spec.category_id:
            continue
        if source == Transaction.CategorySource.MANUAL and not overwrite_manual:
            result.skipped_manual += 1
            continue

        result.changed += 1
        result.by_category[spec.category_id] += 1
        to_update[spec.category_id].append(tx_id)
        if len(result.sample) < SAMPLE_SIZE:
            result.sample.append(
                {
                    "transaction_id": tx_id,
                    "description": description,
                    "amount": str(amount),
                    "old_category_id": category_id,
                    "new_category_id": spec.category_id,
                }
            )

    if not dry_run:
        with db_transaction.atomic():
            for new_category_id, ids in to_update.items():
                for start in range(0, len(ids), BATCH_SIZE):
                    Transaction.objects.filter(id__in=ids[start : start + BATCH_SIZE]).update(
                        category_id=new_category_id,
                        category_source=Transaction.CategorySource.RULE,
                    )

    if not dry_run and result.changed:
        bump_analytics_version(user.id)

    result.duration_ms = int((time.monotonic() - started) * 1000)
    logger.info(
        "rules applied user=%s dry_run=%s checked=%s changed=%s in %sms",
        user.id,
        dry_run,
        result.checked,
        result.changed,
        result.duration_ms,
    )
    return result
