"""Reading Xray's config file, which may contain comments.

Xray accepts `//`, `/* */` and `#` comments. json5 handles the first two (and
trailing commas); whole-line `#` comments are removed before parsing.
"""
import re

import json5

_HASH_LINE = re.compile(r"^[ \t]*#.*$", re.MULTILINE)


def loads(text: str):
    """Parse JSON with comments. Raises ValueError on invalid input."""
    return json5.loads(_HASH_LINE.sub("", text))
