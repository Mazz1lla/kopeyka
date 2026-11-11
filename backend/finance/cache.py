"""Versioned cache for analytics.

Instead of deleting every cached report of a user (summary for each month,
series for each period...), every key includes a per-user version number.
Any write bumps the version, old keys are never read again and expire by TTL.
"""

from collections.abc import Callable
from typing import Any

from django.conf import settings
from django.core.cache import cache


def _version_key(user_id: int) -> str:
    return f"analytics:version:{user_id}"


def get_analytics_version(user_id: int) -> int:
    key = _version_key(user_id)
    version = cache.get(key)
    if version is None:
        cache.add(key, 1, timeout=None)
        version = cache.get(key, 1)
    return version


def bump_analytics_version(user_id: int) -> None:
    key = _version_key(user_id)
    try:
        cache.incr(key)
    except ValueError:  # key is missing (evicted or never created)
        cache.set(key, 2, timeout=None)


def cached_report(user_id: int, name: str, params: str, compute: Callable[[], Any]) -> Any:
    version = get_analytics_version(user_id)
    key = f"analytics:{user_id}:v{version}:{name}:{params}"
    value = cache.get(key)
    if value is None:
        value = compute()
        cache.set(key, value, timeout=settings.ANALYTICS_CACHE_TTL)
    return value
