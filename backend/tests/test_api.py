import pytest
from fastapi import HTTPException

from app import main, metrics



@pytest.fixture
def setup_api(tmp_path, monkeypatch):
    monkeypatch.setattr(main, "OUTPUT_DIR", tmp_path / "files")
    monkeypatch.setattr(metrics, "DB_PATH", tmp_path / "metrics.db")


def invoke(awaitable):
    # The handler awaits only an immediately resolved upload read. Drive it
    # directly so tests do not need the loopback sockets blocked by the sandbox.
    try:
        awaitable.send(None)
    except StopIteration as result:
        return result.value
    raise AssertionError("Unexpected asynchronous suspension in route handler")


class FakeUpload:
    def __init__(self, data: bytes, filename: str):
        self._data = data
        self.filename = filename

    async def read(self, size=-1):
        return self._data[:size]


def upload(data: bytes, filename="sample.bin"):
    return FakeUpload(data, filename)


def downloaded(file_id: str) -> bytes:
    return (main.OUTPUT_DIR / file_id).read_bytes()


@pytest.mark.parametrize("cipher", ["AES-256-GCM", "ChaCha20-Poly1305"])
@pytest.mark.parametrize("size", [257, 5 * 1024 * 1024])
def test_encrypt_decrypt_round_trip(setup_api, cipher, size):
    original = bytes((i % 251 for i in range(size)))
    enc = invoke(main.encrypt(upload(original), "correct horse", cipher))
    assert enc["output_bytes"] == size + 50
    encrypted = downloaded(enc["file_id"])
    assert encrypted.startswith(b"SVLT1")
    dec = invoke(main.decrypt(upload(encrypted, "sample.bin.vault"), "correct horse"))
    assert dec["status"] == "ok"
    assert downloaded(dec["file_id"]) == original


def encrypted_sample():
    result = invoke(main.encrypt(upload(b"secret contents", "secret.txt"), "pass", "AES-256-GCM"))
    return downloaded(result["file_id"])


def test_wrong_password_returns_auth_failed(setup_api):
    encrypted = encrypted_sample()
    result = invoke(main.decrypt(upload(encrypted, "secret.vault"), "wrong"))
    assert result["status"] == "auth_failed"
    assert result["reason"] == "wrong_password_or_tampered"
    assert "file_id" not in result


def test_tamper_endpoint_output_fails_authentication(setup_api):
    encrypted = encrypted_sample()
    result = invoke(main.tamper(upload(encrypted, "secret.vault")))
    altered = downloaded(result["file_id"])
    index = result["flipped_byte_index"]
    assert altered[index] != encrypted[index]
    decrypt_result = invoke(main.decrypt(upload(altered, result["filename"]), "pass"))
    assert decrypt_result["status"] == "auth_failed"


def test_benchmark_rows_and_positive_timings(setup_api):
    body = main.BenchmarkRequest(ciphers=["AES-256-GCM", "DES-CBC"], sizes_kb=[1, 8], runs=2)
    rows = main.benchmark_endpoint(body)["results"]
    assert len(rows) == 4
    assert all(row["avg_ms"] > 0 and row["min_ms"] > 0 and row["max_ms"] > 0 for row in rows)


def test_metrics_record_operations_and_clear(setup_api):
    encrypted = encrypted_sample()
    invoke(main.decrypt(upload(encrypted, "secret.vault"), "bad"))
    invoke(main.tamper(upload(encrypted, "secret.vault")))
    body = main.BenchmarkRequest(ciphers=["AES-256-GCM"], sizes_kb=[1], runs=1)
    main.benchmark_endpoint(body)
    data = main.metrics_endpoint()
    assert data["summary"]["total_ops"] == 4
    assert data["summary"]["auth_failures"] == 1
    assert {entry["operation"] for entry in data["entries"]} >= {"encrypt", "decrypt", "tamper", "benchmark"}
    main.clear_metrics_endpoint()
    assert main.metrics_endpoint()["summary"]["total_ops"] == 0


def test_invalid_header_is_bad_request(setup_api):
    with pytest.raises(HTTPException) as exc:
        invoke(main.decrypt(upload(b"not a vault"), "pass"))
    assert exc.value.status_code == 400
