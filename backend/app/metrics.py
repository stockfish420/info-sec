from __future__ import annotations

import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

DB_PATH = Path(__file__).resolve().parents[1] / "data" / "metrics.db"


def connect() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(DB_PATH)
    db.row_factory = sqlite3.Row
    db.execute("""CREATE TABLE IF NOT EXISTS metrics (
        id TEXT PRIMARY KEY, timestamp TEXT NOT NULL, operation TEXT NOT NULL,
        cipher TEXT NOT NULL, size_bytes INTEGER NOT NULL, duration_ms REAL NOT NULL,
        status TEXT NOT NULL
    )""")
    return db


def log(operation: str, cipher: str, size_bytes: int, duration_ms: float, status: str) -> None:
    with connect() as db:
        db.execute("INSERT INTO metrics VALUES (?, ?, ?, ?, ?, ?, ?)", (
            str(uuid4()), datetime.now(timezone.utc).isoformat(), operation,
            cipher, size_bytes, duration_ms, status,
        ))


def get_metrics() -> dict:
    with connect() as db:
        rows = db.execute("SELECT * FROM metrics ORDER BY timestamp DESC, rowid DESC").fetchall()
        summary = db.execute("""SELECT COUNT(*) total_ops,
            AVG(CASE WHEN operation='encrypt' THEN duration_ms END) avg_encrypt_ms,
            AVG(CASE WHEN operation='decrypt' AND status='ok' THEN duration_ms END) avg_decrypt_ms,
            SUM(CASE WHEN status='auth_failed' THEN 1 ELSE 0 END) auth_failures
            FROM metrics""").fetchone()
    return {"summary": {"total_ops": summary["total_ops"],
        "avg_encrypt_ms": summary["avg_encrypt_ms"] or 0,
        "avg_decrypt_ms": summary["avg_decrypt_ms"] or 0,
        "auth_failures": summary["auth_failures"] or 0},
        "entries": [dict(row) for row in rows]}


def clear_metrics() -> None:
    with connect() as db:
        db.execute("DELETE FROM metrics")
