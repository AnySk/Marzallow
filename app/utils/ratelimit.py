"""In-memory limiter for failed admin logins (the app runs as a single process)."""
import threading
import time
from collections import defaultdict, deque
from typing import Deque, Dict


class LoginRateLimiter:
    """Lock out a client after `max_failures` failed logins within `window` seconds.

    The lockout lasts until the oldest failure in the window expires, so a
    locked-out client can try again `window` seconds after its first failure.
    """

    def __init__(self, max_failures: int, window: int):
        self.max_failures = max_failures
        self.window = window
        self._failures: Dict[str, Deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()

    @property
    def enabled(self) -> bool:
        return self.max_failures > 0 and self.window > 0

    def _prune(self, key: str, now: float) -> Deque[float]:
        failures = self._failures[key]
        while failures and failures[0] <= now - self.window:
            failures.popleft()
        if not failures:
            del self._failures[key]
        return failures

    def retry_after(self, key: str) -> int:
        """Seconds until `key` may try again (0 if not locked out)."""
        if not self.enabled:
            return 0
        now = time.monotonic()
        with self._lock:
            failures = self._prune(key, now)
            if len(failures) < self.max_failures:
                return 0
            return max(1, int(failures[0] + self.window - now) + 1)

    def record_failure(self, key: str) -> int:
        """Record a failed attempt and return the number of failures in the window."""
        if not self.enabled:
            return 0
        now = time.monotonic()
        with self._lock:
            failures = self._prune(key, now)
            failures.append(now)
            self._failures[key] = failures
            return len(failures)

    def reset(self, key: str) -> None:
        with self._lock:
            self._failures.pop(key, None)
