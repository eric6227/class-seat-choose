import base64
import hashlib
import json
import os
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.primitives import hashes
from app.config import get_settings

settings = get_settings()


def _get_encryption_key() -> bytes:
    key = settings.ENCRYPTION_KEY.encode("utf-8") if isinstance(settings.ENCRYPTION_KEY, str) else settings.ENCRYPTION_KEY
    if len(key) != 32:
        key = hashlib.sha256(key).digest()
    return key


def encrypt_data(plaintext: str) -> str:
    key = _get_encryption_key()
    salt = os.urandom(16)
    iv = os.urandom(12)

    kdf = PBKDF2HMAC(algorithm=hashes.SHA256(), length=32, salt=salt, iterations=settings.PBKDF2_ITERATIONS)
    derived_key = kdf.derive(key)

    aesgcm = AESGCM(derived_key)
    aad = b"csc-seat-system-v5"
    ciphertext = aesgcm.encrypt(iv, plaintext.encode("utf-8"), aad)

    combined = salt + iv + ciphertext
    return base64.b64encode(combined).decode("ascii")


def decrypt_data(encrypted_data: str) -> str | None:
    try:
        key = _get_encryption_key()
        combined = base64.b64decode(encrypted_data)

        salt = combined[:16]
        iv = combined[16:28]
        ciphertext = combined[28:]

        kdf = PBKDF2HMAC(algorithm=hashes.SHA256(), length=32, salt=salt, iterations=settings.PBKDF2_ITERATIONS)
        derived_key = kdf.derive(key)

        aesgcm = AESGCM(derived_key)
        aad = b"csc-seat-system-v5"
        plaintext = aesgcm.decrypt(iv, ciphertext, aad)
        return plaintext.decode("utf-8")
    except Exception:
        return None


def encrypt_with_password(plaintext: str, password: str) -> str:
    salt = os.urandom(16)
    iv = os.urandom(12)

    kdf = PBKDF2HMAC(algorithm=hashes.SHA256(), length=32, salt=salt, iterations=600000)
    key = kdf.derive(password.encode("utf-8"))

    aesgcm = AESGCM(key)
    aad = b"csc-seat-system-v5"
    ciphertext = aesgcm.encrypt(iv, plaintext.encode("utf-8"), aad)

    combined = salt + iv + ciphertext
    return base64.b64encode(combined).decode("ascii")


def decrypt_with_password(encrypted_data: str, password: str) -> str | None:
    try:
        combined = base64.b64decode(encrypted_data)

        salt = combined[:16]
        iv = combined[16:28]
        ciphertext = combined[28:]

        kdf = PBKDF2HMAC(algorithm=hashes.SHA256(), length=32, salt=salt, iterations=600000)
        key = kdf.derive(password.encode("utf-8"))

        aesgcm = AESGCM(key)
        aad = b"csc-seat-system-v5"
        plaintext = aesgcm.decrypt(iv, ciphertext, aad)
        return plaintext.decode("utf-8")
    except Exception:
        return None


_FILE_AAD = b"csc-seat-db-file-v5"
_CHUNK_SIZE = 1024 * 1024


def encrypt_bytes(data: bytes) -> bytes:
    key = _get_encryption_key()
    salt = os.urandom(16)
    iv = os.urandom(12)

    kdf = PBKDF2HMAC(algorithm=hashes.SHA256(), length=32, salt=salt, iterations=settings.PBKDF2_ITERATIONS)
    derived_key = kdf.derive(key)

    aesgcm = AESGCM(derived_key)
    ciphertext = aesgcm.encrypt(iv, data, _FILE_AAD)

    return salt + iv + ciphertext


def decrypt_bytes(encrypted_data: bytes) -> bytes | None:
    try:
        key = _get_encryption_key()

        salt = encrypted_data[:16]
        iv = encrypted_data[16:28]
        ciphertext = encrypted_data[28:]

        kdf = PBKDF2HMAC(algorithm=hashes.SHA256(), length=32, salt=salt, iterations=settings.PBKDF2_ITERATIONS)
        derived_key = kdf.derive(key)

        aesgcm = AESGCM(derived_key)
        plaintext = aesgcm.decrypt(iv, ciphertext, _FILE_AAD)
        return plaintext
    except Exception:
        return None