from datetime import date
from decimal import Decimal

import pytest

from finance.importers import (
    ParsedRow,
    StatementError,
    fingerprints,
    parse_amount,
    parse_date,
    parse_statement,
)


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("-1 234,56", "-1234.56"),
        ("-1\xa0234,56", "-1234.56"),
        ("1234.5 ₽", "1234.50"),
        ("1,234.56", "1234.56"),
        ("+500", "500.00"),
        ("-61,00 RUB", "-61.00"),
    ],
)
def test_parse_amount(raw, expected):
    assert parse_amount(raw) == Decimal(expected)


@pytest.mark.parametrize("raw", ["", "abc", "12,34,56", "NaN", "Infinity"])
def test_parse_amount_rejects_garbage(raw):
    with pytest.raises(ValueError):
        parse_amount(raw)


@pytest.mark.parametrize(
    "raw", ["31.10.2026", "31.10.2026 18:04:11", "31.10.2026 18:04", "2026-10-31"]
)
def test_parse_date(raw):
    assert parse_date(raw) == date(2026, 10, 31)


def test_parse_date_rejects_garbage():
    with pytest.raises(ValueError):
        parse_date("31/10/26")


def test_parses_cp1251_semicolon_statement_with_bank_headers():
    content = (
        "Дата операции;Статус;Сумма операции;Описание\n"
        "31.10.2026 18:04:11;OK;-1 234,56;ПЯТЁРОЧКА 1234\n"
        "30.10.2026 09:00:00;FAILED;-999,00;Отклонённая покупка\n"
        "29.10.2026 12:00:00;OK;50000,00;Зарплата\n"
    ).encode("cp1251")

    result = parse_statement(content)

    assert result.total == 3
    assert result.skipped == 1
    assert result.errors == []
    assert [(r.date, r.amount, r.description) for r in result.rows] == [
        (date(2026, 10, 31), Decimal("-1234.56"), "ПЯТЁРОЧКА 1234"),
        (date(2026, 10, 29), Decimal("50000.00"), "Зарплата"),
    ]


def test_parses_utf8_bom_comma_statement_with_english_headers():
    content = '﻿Date,Amount,Description\n2026-10-01,-100.00,"Coffee, to go"\n'.encode()

    result = parse_statement(content)

    assert len(result.rows) == 1
    assert result.rows[0].description == "Coffee, to go"


def test_broken_rows_are_reported_with_line_numbers():
    content = (
        "Дата;Сумма;Описание\n"
        "01.10.2026;-100;Магнит\n"
        "вчера;-100;Магнит\n"
        "02.10.2026;сто рублей;Магнит\n"
        "03.10.2026;0;Магнит\n"
        "04.10.2026;-50;\n"
        "\n"
        "05.10.2026;-70;Магнит\n"
    ).encode()

    result = parse_statement(content)

    assert len(result.rows) == 2
    assert [e["line"] for e in result.errors] == [3, 4, 5, 6]


def test_missing_columns_fail_the_whole_file():
    with pytest.raises(StatementError, match="description"):
        parse_statement("Дата;Сумма\n01.10.2026;-100\n".encode())


def test_empty_file_fails():
    with pytest.raises(StatementError):
        parse_statement(b"   ")


def test_fingerprints_distinguish_identical_rows_inside_one_file():
    row = ParsedRow(2, date(2026, 10, 1), Decimal("-250.00"), "Кофейня")
    first = fingerprints(1, [row, row])
    again = fingerprints(1, [row, row])
    other_account = fingerprints(2, [row])

    assert first[0] != first[1]  # two coffees on the same day are two purchases
    assert first == again  # re-import produces the same ids
    assert other_account[0] != first[0]


def test_fingerprint_ignores_description_noise():
    a = ParsedRow(2, date(2026, 10, 1), Decimal("-1.00"), "ПЯТЁРОЧКА  1")
    b = ParsedRow(2, date(2026, 10, 1), Decimal("-1.00"), "пятерочка 1")
    assert fingerprints(1, [a]) == fingerprints(1, [b])
