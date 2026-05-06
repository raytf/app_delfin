"""System information collection for benchmark metadata."""

import json
import platform
import subprocess

import psutil


def collect_sysinfo() -> dict:
    """Return a dict of hardware and OS details for benchmark metadata."""
    info = {
        "platform": platform.system(),
        "platform_version": platform.version(),
        "machine": platform.machine(),
        "python_version": platform.python_version(),
        "cpu": _get_cpu_name(),
        "cpu_physical_cores": psutil.cpu_count(logical=False),
        "cpu_logical_cores": psutil.cpu_count(logical=True),
        "ram_total_gb": round(psutil.virtual_memory().total / (1024 ** 3), 1),
    }

    gpu = _get_gpu_name()
    if gpu:
        info["gpu"] = gpu

    return info


def _get_cpu_name() -> str:
    system = platform.system()
    try:
        if system == "Darwin":
            out = subprocess.check_output(
                ["sysctl", "-n", "machdep.cpu.brand_string"], text=True, timeout=5
            )
            return out.strip()
        elif system == "Linux":
            with open("/proc/cpuinfo") as f:
                for line in f:
                    if line.startswith("model name"):
                        return line.split(":", 1)[1].strip()
        elif system == "Windows":
            out = subprocess.check_output(
                ["wmic", "cpu", "get", "name", "/value"], text=True, timeout=5
            )
            for line in out.splitlines():
                if line.startswith("Name="):
                    return line.split("=", 1)[1].strip()
    except Exception:
        pass
    return platform.processor() or "Unknown CPU"


def _get_gpu_name() -> str | None:
    # NVIDIA via nvidia-smi
    try:
        out = subprocess.check_output(
            ["nvidia-smi", "--query-gpu=name", "--format=csv,noheader"],
            text=True,
            timeout=5,
        )
        name = out.strip().split("\n")[0]
        if name:
            return name
    except (FileNotFoundError, subprocess.CalledProcessError, subprocess.TimeoutExpired):
        pass

    # macOS via system_profiler
    if platform.system() == "Darwin":
        try:
            out = subprocess.check_output(
                ["system_profiler", "SPDisplaysDataType", "-json"],
                text=True,
                timeout=10,
            )
            data = json.loads(out)
            displays = data.get("SPDisplaysDataType", [])
            if displays:
                return displays[0].get("sppci_model") or displays[0].get("_name")
        except Exception:
            pass

    return None
