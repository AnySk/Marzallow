"""The node's self-signed certificate.

The panel pins it on first contact and checks the name "Gozargah" when it
calls the node's Xray API, so that name must not change.
"""
import datetime
import os

from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.x509.oid import NameOID

CERT_NAME = "Gozargah"


def generate_certificate() -> dict:
    key = rsa.generate_private_key(public_exponent=65537, key_size=4096)
    name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, CERT_NAME)])
    now = datetime.datetime.now(datetime.timezone.utc)
    cert = (
        x509.CertificateBuilder()
        .subject_name(name)
        .issuer_name(name)
        .public_key(key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(now - datetime.timedelta(days=1))
        .not_valid_after(now + datetime.timedelta(days=100 * 365))
        .add_extension(x509.SubjectAlternativeName([x509.DNSName(CERT_NAME)]), critical=False)
        .sign(key, hashes.SHA512())
    )
    return {
        "cert": cert.public_bytes(serialization.Encoding.PEM).decode(),
        "key": key.private_bytes(
            serialization.Encoding.PEM,
            serialization.PrivateFormat.TraditionalOpenSSL,
            serialization.NoEncryption(),
        ).decode(),
    }


def ensure_certificate(cert_file: str, key_file: str) -> bool:
    """Create the certificate if it doesn't exist yet. Returns True if one was created."""
    if os.path.isfile(cert_file) and os.path.isfile(key_file):
        return False
    pems = generate_certificate()
    for path in (cert_file, key_file):
        if os.path.dirname(path):
            os.makedirs(os.path.dirname(path), exist_ok=True)
    # the key is written first and only readable by the owner
    fd = os.open(key_file, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w") as f:
        f.write(pems["key"])
    with open(cert_file, "w") as f:
        f.write(pems["cert"])
    return True
