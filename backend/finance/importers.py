"""Parsing of bank statements exported to CSV.

Every bank exports a slightly different file, so the parser is tolerant:
  * encoding: UTF-8 (with or without BOM) or Windows-1251;
  * delimiter: ';', ',' or tab, detected by csv.Sniffer;
  * columns are found by header aliases ("Дата операции", "Date", ...);
  * amounts like "-1 234,56", "1234.56 ₽" or with a non-breaking space;
  * dates like 31.12.2025, 31.12.2025 18:04:11 or 2025-12-31.

A broken row doesn't fail the whole file: it is reported with its line number.
"""

from __future__ import annotations

import csv
import hashlib
import io
from collections import Counter
from dataclasses import dataclass, field
from datetime import date, datetime
from decimal import Decimal, InvalidOperation

from rules.engine import normalize

HEADER_ALIASES: dict[str, set[str]] = {
    "date": {"дата", "дата операции", "дата платежа", "date", "transaction date"},
    "amount": {"сумма", "сумма операции", "сумма платежа", "amount"},
    "description": {"описание", "назначение", "назначение платежа", "description", "details"},
    "status": {"статус", "status"},
}
REQUIRED_COLUMNS = ("date", "amount", "description")
# rows with these statuses were never charged, importing them would be a lie
SKIPPED_STATUSES = {"failed", "declined", "отклонена", "отменена"}
DATE_FORMATS = ("%d.%m.%Y %H:%M:%S", "%d.%m.%Y %H:%M", "%d.%m.%Y", "%Y-%m-%d", "%Y-%m-%d %H:%M:%S")
MAX_ERRORS = 100


class StatementError(ValueError):
    """The file can't be parsed at all (wrong format, no required columns)."""


@dataclass(frozen=True)
class ParsedRow:
    line: int
    date: date
    amount: Decimal
    description: str


@dataclass
class ParseResult:
    rows: list[ParsedRow] = field(default_factory=list)
    errors: list[dict] = field(default_factory=list)
    skipped: int = 0
    total: int = 0

    def add_error(self, line: int, message: str) -> None:
        if len(self.errors) < MAX_ERRORS:
            self.errors.append({"line": line, "message": message})


def decode(raw: bytes) -> str:
    try:
        return raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        return raw.decode("cp1251")


def parse_amount(value: str) -> Decimal:
    cleaned = (
        value.replace("\xa0", "")
        .replace(" ", "")
        .replace("₽", "")
        .replace("RUB", "")
        .replace("руб.", "")
        .strip()
    )
    if "," in cleaned and "." in cleaned:  # 1,234.56
        cleaned = cleaned.replace(",", "")
    cleaned = cleaned.replace(",", ".")
    try:
        amount = Decimal(cleaned)
    except InvalidOperation as exc:
        raise ValueError(f"не удалось разобрать сумму «{value}»") from exc
    if not amount.is_finite():
        raise ValueError(f"не удалось разобрать сумму «{value}»")
    return amount.quantize(Decimal("0.01"))


def parse_date(value: str) -> date:
    value = value.strip()
    for fmt in DATE_FORMATS:
        try:
            return datetime.strptime(value, fmt).date()
        except ValueError:
            continue
    raise ValueError(f"не удалось разобрать дату «{value}»")


def _map_headers(fieldnames: list[str]) -> dict[str, str]:
    mapping: dict[str, str] = {}
    for original in fieldnames:
        key = normalize(original or "")
        for column, aliases in HEADER_ALIASES.items():
            if key in aliases and column not in mapping:
                mapping[column] = original
    missing = [c for c in REQUIRED_COLUMNS if c not in mapping]
    if missing:
        raise StatementError(
            "В файле не найдены колонки: " + ", ".join(missing) + ". "
            "Нужны заголовки вроде «Дата операции», «Сумма», «Описание»."
        )
    return mapping


def parse_statement(raw: bytes) -> ParseResult:
    text = decode(raw)
    if not text.strip():
        raise StatementError("Файл пустой")

    sample = text[:4096]
    try:
        delimiter = csv.Sniffer().sniff(sample, delimiters=";,\t").delimiter
    except csv.Error:
        delimiter = ";" if sample.count(";") > sample.count(",") else ","

    reader = csv.DictReader(io.StringIO(text), delimiter=delimiter)
    if not reader.fieldnames:
        raise StatementError("В файле нет строки с заголовками")
    columns = _map_headers(list(reader.fieldnames))

    result = ParseResult()
    for line_no, row in enumerate(reader, start=2):  # line 1 is the header
        if not any((v or "").strip() for v in row.values()):
            continue
        result.total += 1

        status = normalize(row.get(columns.get("status", ""), "") or "")
        if status in SKIPPED_STATUSES:
            result.skipped += 1
            continue

        try:
            tx_date = parse_date(row[columns["date"]] or "")
            amount = parse_amount(row[columns["amount"]] or "")
        except ValueError as exc:
            result.add_error(line_no, str(exc))
            continue

        description = (row[columns["description"]] or "").strip()[:255]
        if not description:
            result.add_error(line_no, "пустое описание")
            continue
        if amount == 0:
            result.add_error(line_no, "нулевая сумма")
            continue
        result.rows.append(ParsedRow(line_no, tx_date, amount, description))

    return result


def fingerprints(account_id: int, rows: list[ParsedRow]) -> list[str]:
    """Stable id for each row, used to skip rows imported earlier.

    Two coffees for the same price on the same day are different purchases,
    so identical rows get an occurrence number inside the file.
    """
    seen: Counter[tuple] = Counter()
    result = []
    for row in rows:
        key = (row.date.isoformat(), str(row.amount), normalize(row.description))
        occurrence = seen[key]
        seen[key] += 1
        payload = "|".join((str(account_id), *key, str(occurrence)))
        result.append(hashlib.sha256(payload.encode()).hexdigest())
    return result
