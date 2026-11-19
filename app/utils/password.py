"""Admin password hashing.

Replaces passlib (unmaintained, incompatible with bcrypt>=4.1). Produces and
verifies the same `$2b$` bcrypt hashes passlib did, so existing admins keep
working.
"""
import bcrypt

# bcrypt only uses the first 72 bytes. passlib (with bcrypt<5) truncated
# silently; bcrypt>=5 raises instead, so truncate explicitly to keep long
# passwords that were set before the upgrade valid.
_BCRYPT_MAX_BYTES = 72


def _encode(password: str) -> bytes:
    return password.encode("utf-8")[:_BCRYPT_MAX_BYTES]


def hash_password(password: str) -> str:
    return bcrypt.hashpw(_encode(password), bcrypt.gensalt()).decode("ascii")


def verify_password(password: str, hashed: str) -> bool:
    if not hashed:
        return False
    try:
        return bcrypt.checkpw(_encode(password), hashed.encode("ascii"))
    except ValueError:  # malformed hash in the database
        return False
