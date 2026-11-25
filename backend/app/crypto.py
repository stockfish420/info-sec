"""SecureVault authenticated file encryption format and helpers."""
from __future__ import annotations

import os
import time
from dataclasses import dataclass

from Crypto.Cipher import AES, ChaCha20_Poly1305
from Crypto.Protocol.KDF import scrypt

MAGIC = b"SVLT1"
HEADER_SIZE = 5 + 1 + 16 + 12
TAG_SIZE = 16
SCRYPT_N, SCRYPT_R, SCRYPT_P = 2**15, 8, 1
CIPHER_IDS = {"AES-256-GCM": 1, "ChaCha20-Poly1305": 2}
ID_CIPHERS = {value: key for key, value in CIPHER_IDS.items()}


class InvalidVault(ValueError):
    pass


@dataclass
class CryptoResult:
    data: bytes
    cipher: str
    kdf_ms: float
    cipher_ms: float


def derive_key(password: str, salt: bytes) -> bytes:
    return scrypt(password.encode("utf-8"), salt, 32, SCRYPT_N, SCRYPT_R, SCRYPT_P)


def encrypt_bytes(data: bytes, password: str, cipher_name: str) -> CryptoResult:
    if cipher_name not in CIPHER_IDS:
        raise ValueError("Unsupported vault cipher")
    salt, nonce = os.urandom(16), os.urandom(12)
    start = time.perf_counter()
    key = derive_key(password, salt)
    kdf_ms = (time.perf_counter() - start) * 1000
    header = MAGIC + bytes([CIPHER_IDS[cipher_name]]) + salt + nonce
    start = time.perf_counter()
    cipher = AES.new(key, AES.MODE_GCM, nonce=nonce, mac_len=TAG_SIZE) if cipher_name == "AES-256-GCM" else ChaCha20_Poly1305.new(key=key, nonce=nonce)
    cipher.update(header)
    ciphertext, tag = cipher.encrypt_and_digest(data)
    cipher_ms = (time.perf_counter() - start) * 1000
    return CryptoResult(header + ciphertext + tag, cipher_name, kdf_ms, cipher_ms)


def decrypt_bytes(data: bytes, password: str) -> CryptoResult:
    if not data.startswith(MAGIC):
        raise InvalidVault("Invalid SecureVault file")
    if len(data) < HEADER_SIZE + TAG_SIZE:
        raise InvalidVault("Invalid SecureVault file")
    cipher_id = data[5]
    cipher_name = ID_CIPHERS.get(cipher_id)
    header, salt, nonce = data[:HEADER_SIZE], data[6:22], data[22:34]
    ciphertext, tag = data[HEADER_SIZE:-TAG_SIZE], data[-TAG_SIZE:]
    start = time.perf_counter()
    key = derive_key(password, salt)
    kdf_ms = (time.perf_counter() - start) * 1000
    if not cipher_name:
        raise PermissionError(("unknown", kdf_ms, 0.0))
    start = time.perf_counter()
    cipher = AES.new(key, AES.MODE_GCM, nonce=nonce, mac_len=TAG_SIZE) if cipher_name == "AES-256-GCM" else ChaCha20_Poly1305.new(key=key, nonce=nonce)
    cipher.update(header)
    try:
        plaintext = cipher.decrypt_and_verify(ciphertext, tag)
    except ValueError:
        plaintext = None
    cipher_ms = (time.perf_counter() - start) * 1000
    if plaintext is None:
        raise PermissionError((cipher_name, kdf_ms, cipher_ms))
    return CryptoResult(plaintext, cipher_name, kdf_ms, cipher_ms)


def tamper_bytes(data: bytes) -> tuple[bytes, int]:
    if not data.startswith(MAGIC):
        raise InvalidVault("Invalid SecureVault file")
    if len(data) < HEADER_SIZE + TAG_SIZE + 1:
        raise InvalidVault("File has no ciphertext byte to modify")
    index = HEADER_SIZE + int.from_bytes(os.urandom(8), "big") % (len(data) - HEADER_SIZE - TAG_SIZE)
    altered = bytearray(data)
    altered[index] ^= 1 << (os.urandom(1)[0] % 8)
    return bytes(altered), index
