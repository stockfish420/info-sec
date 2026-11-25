from __future__ import annotations

import os
import tempfile
import time
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from . import benchmark, metrics
from .crypto import HEADER_SIZE, InvalidVault, decrypt_bytes, encrypt_bytes, tamper_bytes

app = FastAPI(title="SecureVault API")
app.add_middleware(CORSMiddleware, allow_origins=[
    "http://localhost:3000", "http://127.0.0.1:3000",
], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

OUTPUT_DIR = Path(tempfile.gettempdir()) / "securevault"
MAX_UPLOAD = 50 * 1024 * 1024
VAULT_HEADER_SIZE = HEADER_SIZE


def cleanup_old_files() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    cutoff = time.time() - 3600
    for path in OUTPUT_DIR.iterdir():
        try:
            if path.is_file() and path.stat().st_mtime < cutoff:
                path.unlink()
        except OSError:
            continue


def save_output(data: bytes, filename: str) -> str:
    cleanup_old_files()
    file_id = str(uuid4())
    (OUTPUT_DIR / file_id).write_bytes(data)
    (OUTPUT_DIR / f"{file_id}.name").write_text(filename, encoding="utf-8")
    return file_id


def safe_filename(name: str) -> str:
    return Path(name.replace("\\", "/")).name or "download"


async def read_upload(upload: UploadFile) -> bytes:
    data = await upload.read(MAX_UPLOAD + 1)
    if len(data) > MAX_UPLOAD:
        raise HTTPException(status_code=413, detail="Upload exceeds 50 MB")
    return data


def rate(size: int, cipher_ms: float) -> float:
    return (size / 1048576 / (cipher_ms / 1000)) if cipher_ms > 0 else 0.0


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/api/encrypt")
async def encrypt(file: UploadFile = File(...), password: str = Form(...), cipher: str = Form(...)):
    data = await read_upload(file)
    started = time.perf_counter()
    try:
        result = encrypt_bytes(data, password, cipher)
        output_name = safe_filename(file.filename or "file") + ".vault"
        file_id = save_output(result.data, output_name)
        total = result.kdf_ms + result.cipher_ms
        metrics.log("encrypt", cipher, len(data), total, "ok")
        return {"file_id": file_id, "filename": output_name, "cipher": cipher,
            "input_bytes": len(data), "output_bytes": len(result.data),
            "kdf_ms": result.kdf_ms, "cipher_ms": result.cipher_ms,
            "total_ms": total, "throughput_mb_s": rate(len(data), result.cipher_ms)}
    except ValueError as exc:
        metrics.log("encrypt", cipher, len(data), (time.perf_counter() - started) * 1000, "error")
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/decrypt")
async def decrypt(file: UploadFile = File(...), password: str = Form(...)):
    data = await read_upload(file)
    started = time.perf_counter()
    if not data.startswith(b"SVLT1"):
        metrics.log("decrypt", "unknown", len(data), (time.perf_counter() - started) * 1000, "error")
        raise HTTPException(status_code=400, detail="Invalid SecureVault file")
    try:
        result = decrypt_bytes(data, password)
        output_name = safe_filename(file.filename or "decrypted-file")
        if output_name.lower().endswith(".vault"):
            output_name = output_name[:-6] or "decrypted-file"
        file_id = save_output(result.data, output_name)
        total = result.kdf_ms + result.cipher_ms
        metrics.log("decrypt", result.cipher, len(data), total, "ok")
        return {"status": "ok", "file_id": file_id, "filename": output_name,
            "cipher": result.cipher, "input_bytes": len(data), "output_bytes": len(result.data),
            "kdf_ms": result.kdf_ms, "cipher_ms": result.cipher_ms,
            "total_ms": total, "throughput_mb_s": rate(len(data), result.cipher_ms)}
    except PermissionError as exc:
        cipher, kdf_ms, cipher_ms = exc.args[0]
        total = kdf_ms + cipher_ms
        metrics.log("decrypt", cipher, len(data), total, "auth_failed")
        return {"status": "auth_failed", "input_bytes": len(data), "kdf_ms": kdf_ms,
            "cipher_ms": cipher_ms, "total_ms": total,
            "reason": "wrong_password_or_tampered"}
    except InvalidVault as exc:
        metrics.log("decrypt", "unknown", len(data), (time.perf_counter() - started) * 1000, "error")
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/tamper")
async def tamper(file: UploadFile = File(...)):
    data = await read_upload(file)
    started = time.perf_counter()
    try:
        altered, index = tamper_bytes(data)
        original_name = safe_filename(file.filename or "file.vault")
        stem = original_name[:-6] if original_name.lower().endswith(".vault") else original_name
        filename = f"{stem}-tampered.vault"
        file_id = save_output(altered, filename)
        metrics.log("tamper", "unknown", len(data), (time.perf_counter() - started) * 1000, "ok")
        return {"file_id": file_id, "filename": filename, "flipped_byte_index": index}
    except InvalidVault as exc:
        metrics.log("tamper", "unknown", len(data), (time.perf_counter() - started) * 1000, "error")
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.get("/api/download/{file_id}")
def download(file_id: str):
    cleanup_old_files()
    # UUID filenames prevent traversal; exact UUID validation avoids arbitrary paths.
    try:
        from uuid import UUID
        normalized = str(UUID(file_id))
    except ValueError as exc:
        raise HTTPException(status_code=404, detail="File not found") from exc
    path = OUTPUT_DIR / normalized
    if not path.is_file():
        raise HTTPException(status_code=404, detail="File not found")
    # The original name is kept in a sidecar, falling back to a safe generic name.
    name_path = OUTPUT_DIR / f"{normalized}.name"
    filename = name_path.read_text(encoding="utf-8") if name_path.is_file() else "securevault-download"
    return FileResponse(path, media_type="application/octet-stream", filename=filename)


class BenchmarkRequest(BaseModel):
    ciphers: list[str]
    sizes_kb: list[int]
    runs: int = Field(ge=1, le=50)


@app.post("/api/benchmark")
def benchmark_endpoint(body: BenchmarkRequest):
    if not body.ciphers or not body.sizes_kb:
        raise HTTPException(status_code=422, detail="Select ciphers and sizes")
    if any(cipher not in benchmark.ALLOWED for cipher in body.ciphers):
        raise HTTPException(status_code=422, detail="Unsupported benchmark cipher")
    if any(size < 1 or size > 20480 for size in body.sizes_kb):
        raise HTTPException(status_code=422, detail="sizes_kb must be between 1 and 20480")
    started = time.perf_counter()
    try:
        results = benchmark.run_benchmark(body.ciphers, body.sizes_kb, body.runs)
        size = sum(body.sizes_kb) * 1024
        duration = (time.perf_counter() - started) * 1000
        metrics.log("benchmark", ", ".join(body.ciphers), size, duration, "ok")
        return {"ran_at": datetime.now(timezone.utc).isoformat(), "results": results}
    except Exception:
        metrics.log("benchmark", ", ".join(body.ciphers), 0, (time.perf_counter() - started) * 1000, "error")
        raise


@app.post("/api/kdf-benchmark")
def kdf_benchmark():
    import hashlib
    import secrets
    from .crypto import derive_key

    overall_started = time.perf_counter()
    salt = secrets.token_bytes(16)
    password = b"benchmark-password"
    rates = {}
    for name, operation in (("sha", lambda: hashlib.sha256(password + salt).digest()),
                            ("scrypt", lambda: derive_key(password.decode(), salt))):
        count, started = 0, time.perf_counter()
        while time.perf_counter() - started < 1.0:
            operation()
            count += 1
        elapsed = time.perf_counter() - started
        rates[name] = count / elapsed
    metrics.log("kdf_benchmark", "SHA-256/scrypt", 0,
        (time.perf_counter() - overall_started) * 1000, "ok")
    return {"sha256_guesses_per_sec": rates["sha"],
        "scrypt_guesses_per_sec": rates["scrypt"],
        "slowdown_ratio": rates["sha"] / rates["scrypt"]}


@app.get("/api/metrics")
def metrics_endpoint():
    return metrics.get_metrics()


@app.delete("/api/metrics")
def clear_metrics_endpoint():
    metrics.clear_metrics()
    return {"status": "ok"}
