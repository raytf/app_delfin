# -*- mode: python ; coding: utf-8 -*-
"""PyInstaller spec for freezing the Delfin Python sidecar."""

from pathlib import Path
from PyInstaller.utils.hooks import collect_all

# SPECPATH is set by PyInstaller to the directory containing this file.
sidecar_dir = Path(SPECPATH)

block_cipher = None

# ---------------------------------------------------------------------------
# Collect native libraries and data files for packages that need them
# ---------------------------------------------------------------------------
all_binaries = []
all_datas = []

for pkg in ("kokoro_onnx", "onnxruntime", "litert_lm"):
    try:
        binaries, datas = collect_all(pkg)
        all_binaries.extend(binaries)
        all_datas.extend(datas)
    except Exception as exc:
        print(f"[delfin-sidecar.spec] Warning: could not collect {pkg}: {exc}")

# espeakng_loader is Linux-only (used by kokoro-onnx phonemizer)
import sys
if sys.platform == "linux":
    try:
        binaries, datas = collect_all("espeakng_loader")
        all_binaries.extend(binaries)
        all_datas.extend(datas)
    except Exception as exc:
        print(f"[delfin-sidecar.spec] Warning: could not collect espeakng_loader: {exc}")

a = Analysis(
    [str(sidecar_dir / "server.py")],
    pathex=[str(sidecar_dir)],
    binaries=all_binaries,
    datas=all_datas,
    hiddenimports=[
        # Uvicorn workers and protocols
        "uvicorn.logging",
        "uvicorn.loops",
        "uvicorn.loops.auto",
        "uvicorn.protocols",
        "uvicorn.protocols.http",
        "uvicorn.protocols.http.auto",
        "uvicorn.protocols.websockets",
        "uvicorn.protocols.websockets.auto",
        # WebSocket support
        "websockets",
        "websockets.legacy",
        "websockets.legacy.server",
        "websockets.legacy.client",
        "websockets.server",
        "websockets.client",
        # FastAPI / Pydantic
        "fastapi",
        "starlette",
        "pydantic",
        "pydantic.deprecated.decorator",
        # HuggingFace
        "huggingface_hub",
        # Utilities
        "dotenv",
        "PIL",
        "PIL._imagingtk",
        "PIL._tkinter_finder",
        "numpy",
        # Sidecar sub-packages
        "inference",
        "inference.engine",
        "inference.preprocess",
        "prompts",
        "prompts.generic_screen",
        "prompts.lecture_slide",
        "prompts.presets",
        "tts",
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=["tkinter", "matplotlib", "pytest", "_pytest", "IPython"],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

# One-directory build (faster startup than one-file, and easier to bundle into Electron)
exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="delfin-sidecar",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name="delfin-sidecar",
)
