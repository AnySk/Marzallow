import re
import subprocess

from app import logger
from app.utils.crypto import get_x25519_public_key
from config import DEBUG
from node.core import XRayCore as BaseXRayCore


class XRayCore(BaseXRayCore):
    """The panel's local Xray process (the process handling is shared with the node service)."""

    def __init__(self,
                 executable_path: str = "/usr/bin/xray",
                 assets_path: str = "/usr/share/xray"):
        super().__init__(executable_path, assets_path, logger=logger, debug=DEBUG)

    def get_x25519(self, private_key: str = None):
        """Generate (or derive from `private_key`) an X25519 key pair.

        Derivation is done in Python; only key generation shells out to xray.
        Xray has changed the `xray x25519` output labels several times
        ("Public key:" -> "PublicKey:" -> "Password (PublicKey):"), so the
        output is parsed by label prefix rather than exact text.
        """
        if private_key:
            return {"private_key": private_key, "public_key": get_x25519_public_key(private_key)}

        output = subprocess.check_output([self.executable_path, "x25519"], stderr=subprocess.STDOUT).decode('utf-8')
        values = {}
        for line in output.splitlines():
            if ':' in line:
                label, value = line.split(':', 1)
                values[re.sub(r'[^a-z]', '', label.lower())] = value.strip()
        private = next((v for k, v in values.items() if k.startswith('privatekey')), None)
        if private:
            return {"private_key": private, "public_key": get_x25519_public_key(private)}
