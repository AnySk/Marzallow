import base64

from cryptography import x509
from cryptography.hazmat.backends import default_backend
from cryptography.hazmat.primitives.asymmetric.x25519 import X25519PrivateKey
from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat

from node.certificate import generate_certificate  # noqa: F401  (the panel's node-client certificate)


def get_cert_SANs(cert: bytes):
    cert = x509.load_pem_x509_certificate(cert, default_backend())
    san_list = []
    for extension in cert.extensions:
        if isinstance(extension.value, x509.SubjectAlternativeName):
            san = extension.value
            for name in san:
                san_list.append(name.value)
    return san_list


def get_x25519_public_key(private_key: str) -> str:
    """Derive a REALITY public key from its private key.

    Both use xray's encoding: URL-safe base64 of the raw 32 bytes, unpadded.
    """
    raw = base64.urlsafe_b64decode(private_key + '=' * (-len(private_key) % 4))
    if len(raw) != 32:
        raise ValueError("X25519 private key must be 32 bytes")
    public = X25519PrivateKey.from_private_bytes(raw).public_key().public_bytes(Encoding.Raw, PublicFormat.Raw)
    return base64.urlsafe_b64encode(public).decode().rstrip('=')
