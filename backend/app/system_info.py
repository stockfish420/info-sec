"""Read hardware limits visible to the API process without exposing host IDs."""
from __future__ import annotations

import os
import platform
import re
import sys
import time
from pathlib import Path

from .crypto import SCRYPT_N, SCRYPT_R, derive_key

MIB = 1024 * 1024


def _read(path: str) -> str | None:
    try:
        return Path(path).read_text(encoding="utf-8").strip()
    except (OSError, UnicodeError):
        return None


def _linux_memory() -> tuple[int | None, int | None]:
    values: dict[str, int] = {}
    content = _read("/proc/meminfo")
    if content:
        for line in content.splitlines():
            match = re.match(r"^(MemTotal|MemAvailable):\s+(\d+)\s+kB", line)
            if match:
                values[match.group(1)] = int(match.group(2)) * 1024
    return values.get("MemTotal"), values.get("MemAvailable")


def _windows_memory() -> tuple[int | None, int | None]:
    if sys.platform != "win32":
        return None, None
    import ctypes
    from ctypes import wintypes

    class MemoryStatus(ctypes.Structure):
        _fields_ = [
            ("dwLength", wintypes.DWORD), ("dwMemoryLoad", wintypes.DWORD),
            ("ullTotalPhys", ctypes.c_ulonglong), ("ullAvailPhys", ctypes.c_ulonglong),
            ("ullTotalPageFile", ctypes.c_ulonglong), ("ullAvailPageFile", ctypes.c_ulonglong),
            ("ullTotalVirtual", ctypes.c_ulonglong), ("ullAvailVirtual", ctypes.c_ulonglong),
            ("ullAvailExtendedVirtual", ctypes.c_ulonglong),
        ]

    status = MemoryStatus()
    status.dwLength = ctypes.sizeof(status)
    if not ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(status)):
        return None, None
    return int(status.ullTotalPhys), int(status.ullAvailPhys)


def _host_memory() -> tuple[int | None, int | None]:
    if sys.platform.startswith("linux"):
        return _linux_memory()
    windows = _windows_memory()
    if windows[0] is not None:
        return windows
    if hasattr(os, "sysconf"):
        try:
            page_size = os.sysconf("SC_PAGE_SIZE")
            total = page_size * os.sysconf("SC_PHYS_PAGES")
            available = page_size * os.sysconf("SC_AVPHYS_PAGES")
            return int(total), int(available)
        except (OSError, ValueError):
            pass
    return None, None


def _positive_limit(raw: str | None) -> int | None:
    if not raw or raw == "max":
        return None
    try:
        value = int(raw)
    except ValueError:
        return None
    # Linux cgroup v1 uses a very large number to mean "unlimited".
    return value if 0 < value < 1 << 60 else None


def _container_memory() -> tuple[int | None, int | None]:
    limit = _positive_limit(_read("/sys/fs/cgroup/memory.max"))
    current_raw = _read("/sys/fs/cgroup/memory.current")
    if limit is None:
        limit = _positive_limit(_read("/sys/fs/cgroup/memory/memory.limit_in_bytes"))
        current_raw = _read("/sys/fs/cgroup/memory/memory.usage_in_bytes")
    if limit is None:
        return None, None
    try:
        current = max(0, int(current_raw or "0"))
    except ValueError:
        current = 0
    return limit, max(0, limit - current)


def _cpu_set_count(raw: str | None) -> int | None:
    if not raw:
        return None
    cpus: set[int] = set()
    try:
        for part in raw.split(","):
            bounds = part.split("-")
            first = int(bounds[0])
            last = int(bounds[1]) if len(bounds) == 2 else first
            if first < 0 or last < first or last - first > 65536:
                return None
            cpus.update(range(first, last + 1))
    except ValueError:
        return None
    return len(cpus) or None


def _cpu_limits() -> tuple[int, float, str]:
    logical = max(1, os.cpu_count() or 1)
    effective = float(logical)
    sources: list[str] = []
    quota = _read("/sys/fs/cgroup/cpu.max")
    if quota:
        parts = quota.split()
        if len(parts) == 2 and parts[0] != "max":
            try:
                effective = min(effective, max(0.01, int(parts[0]) / int(parts[1])))
                sources.append("container quota")
            except (ValueError, ZeroDivisionError):
                pass
    else:
        quota_raw = _read("/sys/fs/cgroup/cpu/cpu.cfs_quota_us")
        period_raw = _read("/sys/fs/cgroup/cpu/cpu.cfs_period_us")
        try:
            quota_us, period_us = int(quota_raw or "-1"), int(period_raw or "0")
            if quota_us > 0 and period_us > 0:
                effective = min(effective, max(0.01, quota_us / period_us))
                sources.append("container quota")
        except ValueError:
            pass
    cpuset = _cpu_set_count(_read("/sys/fs/cgroup/cpuset.cpus.effective") or _read("/sys/fs/cgroup/cpuset/cpuset.cpus"))
    if cpuset:
        effective = min(effective, float(cpuset))
        sources.append("container CPU set")
    source = ", ".join(sources) if sources else "operating system"
    return logical, round(effective, 2), source


def _processor_name() -> str:
    if sys.platform.startswith("linux"):
        cpuinfo = _read("/proc/cpuinfo")
        if cpuinfo:
            for line in cpuinfo.splitlines():
                key, separator, value = line.partition(":")
                if separator and key.strip().lower() in {"model name", "hardware", "processor"} and value.strip() and not value.strip().isdigit():
                    return value.strip()
    if sys.platform == "win32":
        try:
            import winreg
            key = winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, r"HARDWARE\DESCRIPTION\System\CentralProcessor\0")
            with key:
                name, _ = winreg.QueryValueEx(key, "ProcessorNameString")
                if name.strip():
                    return name.strip()
        except (OSError, ImportError):
            pass
    return platform.processor() or "Not exposed by runtime"


def detect_system_info() -> dict:
    host_total, host_available = _host_memory()
    container_total, container_available = _container_memory()
    logical_cpus, effective_cpus, cpu_source = _cpu_limits()
    kdf_started = time.perf_counter()
    derive_key("securevault-system-probe", os.urandom(16))
    scrypt_ms = (time.perf_counter() - kdf_started) * 1000
    is_vercel = bool(os.getenv("VERCEL"))
    if is_vercel and cpu_source == "operating system":
        effective_cpus = None
        cpu_source = "Vercel allocation unavailable; OS-visible count"
    if container_total is not None:
        total_memory = min(host_total, container_total) if host_total else container_total
        available_memory = min(host_available, container_available) if host_available is not None else container_available
        memory_source = "container limit"
    elif is_vercel:
        total_memory, available_memory = host_total, None
        memory_source = "Vercel allocation unavailable; host memory only"
    else:
        total_memory, available_memory = host_total, host_available
        memory_source = "operating system" if host_total is not None else "unavailable"
    return {
        "system": platform.system() or "Unknown",
        "architecture": platform.machine() or "Unknown",
        "processor": _processor_name(),
        "logical_cpu_count": logical_cpus,
        "effective_cpu_cores": effective_cpus,
        "cpu_source": cpu_source,
        "memory_total_mb": round(total_memory / MIB, 2) if total_memory is not None else None,
        "memory_available_mb": round(available_memory / MIB, 2) if available_memory is not None else None,
        "memory_source": memory_source,
        "scrypt_ms": round(scrypt_ms, 2),
        "scrypt_memory_mb": round(128 * SCRYPT_N * SCRYPT_R / MIB, 2),
        "runtime": "Vercel API runtime" if is_vercel else "Local API process",
    }
