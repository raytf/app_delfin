"""Sidecar server bootstrap."""

from __future__ import annotations

import sys
from pathlib import Path

CURRENT_DIR = Path(__file__).resolve().parent
PARENT_DIR = CURRENT_DIR.parent

if str(PARENT_DIR) not in sys.path:
    sys.path.insert(0, str(PARENT_DIR))
sys.path[:] = [
    path
    for path in sys.path
    if path not in {"", str(CURRENT_DIR)}
]

from sidecar.config import load_config
from sidecar.http.app import create_app
from sidecar.logger import setup_logging

setup_logging()
app = create_app(load_config())
