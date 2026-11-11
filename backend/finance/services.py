import logging

from django.db import transaction as db_transaction

from rules.engine import normalize
from rules.services import build_ruleset

from .cache import bump_analytics_version
from .importers import fingerprints, parse_statement
from .models import Account, ImportBatch, Transaction

logger = logging.getLogger(__name__)

LOOKUP_CHUNK = 900  # keeps "IN (...)" under SQLite's variable limit on old versions


def _existing_fingerprints(account: Account, candidates: list[str]) -> set[str]:
    existing: set[str] = set()
    for start in range(0, len(candidates), LOOKUP_CHUNK):
        chunk = candidates[start : start + LOOKUP_CHUNK]
        existing.update(
            Transaction.objects.filter(account=account, fingerprint__in=chunk).values_list(
                "fingerprint", flat=True
            )
        )
    return existing


def import_statement(user, account: Account, filename: str, raw: bytes) -> ImportBatch:
    """Parse a CSV statement, skip rows imported before, categorize the rest by rules.

    Raises importers.StatementError if the file can't be read at all.
    """
    parsed = parse_statement(raw)
    prints = fingerprints(account.id, parsed.rows)
    existing = _existing_fingerprints(account, prints)
    ruleset = build_ruleset(user)

    with db_transaction.atomic():
        batch = ImportBatch.objects.create(
            owner=user,
            account=account,
            filename=filename[:255],
            rows_total=parsed.total,
            rows_skipped=parsed.skipped,
            errors=parsed.errors,
        )
        new_transactions = []
        for row, fingerprint in zip(parsed.rows, prints, strict=True):
            if fingerprint in existing:
                continue
            spec = ruleset.match(row.description, row.amount)
            new_transactions.append(
                Transaction(
                    owner=user,
                    account=account,
                    date=row.date,
                    amount=row.amount,
                    description=row.description,
                    search_text=normalize(row.description),
                    category_id=spec.category_id if spec else None,
                    category_source=(
                        Transaction.CategorySource.RULE if spec else Transaction.CategorySource.NONE
                    ),
                    import_batch=batch,
                    fingerprint=fingerprint,
                )
            )
        # ignore_conflicts protects from a parallel import of the same file;
        # the counters below may be slightly off in that rare case.
        Transaction.objects.bulk_create(new_transactions, batch_size=1000, ignore_conflicts=True)

        batch.rows_created = len(new_transactions)
        batch.rows_duplicates = len(parsed.rows) - len(new_transactions)
        batch.rows_categorized = sum(1 for tx in new_transactions if tx.category_id)
        batch.save(update_fields=["rows_created", "rows_duplicates", "rows_categorized"])

    if batch.rows_created:
        bump_analytics_version(user.id)
    logger.info(
        "import user=%s account=%s total=%s created=%s duplicates=%s errors=%s",
        user.id,
        account.id,
        batch.rows_total,
        batch.rows_created,
        batch.rows_duplicates,
        len(batch.errors),
    )
    return batch
