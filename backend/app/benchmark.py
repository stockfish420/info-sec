from __future__ import annotations

import os
import time

from Crypto.Cipher import AES, ChaCha20_Poly1305, DES
from Crypto.Util.Padding import pad

ALLOWED = {"AES-256-GCM", "ChaCha20-Poly1305", "DES-CBC"}


def encrypt_once(data: bytes, cipher_name: str, material: tuple[bytes, bytes]) -> None:
    key, nonce_or_iv = material
    if cipher_name == "AES-256-GCM":
        cipher = AES.new(key, AES.MODE_GCM, nonce=nonce_or_iv)
        cipher.encrypt_and_digest(data)
    elif cipher_name == "ChaCha20-Poly1305":
        cipher = ChaCha20_Poly1305.new(key=key, nonce=nonce_or_iv)
        cipher.encrypt_and_digest(data)
    elif cipher_name == "DES-CBC":
        cipher = DES.new(key, DES.MODE_CBC, iv=nonce_or_iv)
        cipher.encrypt(pad(data, DES.block_size))
    else:
        raise ValueError("Unsupported benchmark cipher")


def run_benchmark(ciphers: list[str], sizes_kb: list[int], runs: int) -> list[dict]:
    results = []
    for cipher_name in ciphers:
        for size_kb in sizes_kb:
            data = os.urandom(size_kb * 1024)
            def material():
                return (os.urandom(8), os.urandom(8)) if cipher_name == "DES-CBC" else (os.urandom(32), os.urandom(12))
            encrypt_once(data, cipher_name, material())  # untimed warm-up
            materials = [material() for _ in range(runs)]
            samples = []
            for run_material in materials:
                start = time.perf_counter()
                encrypt_once(data, cipher_name, run_material)
                samples.append((time.perf_counter() - start) * 1000)
            avg = sum(samples) / len(samples)
            results.append({"cipher": cipher_name, "size_kb": size_kb, "runs": runs,
                "avg_ms": avg, "min_ms": min(samples), "max_ms": max(samples),
                "throughput_mb_s": (size_kb / 1024) / (avg / 1000)})
    return results
