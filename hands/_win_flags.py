"""Shared subprocess creation flags for Windows.

Import CREATION_FLAGS and pass as `creationflags=CREATION_FLAGS` to any
subprocess.run / subprocess.Popen call to prevent console windows from
flashing on screen on Windows.

On non-Windows platforms CREATION_FLAGS is 0, which is a no-op.
"""

from __future__ import annotations
import subprocess
import sys

CREATION_FLAGS: int = 0
if sys.platform == "win32":
    # CREATE_NO_WINDOW prevents the subprocess from allocating a console window.
    # Also available as subprocess.CREATE_NO_WINDOW in Python 3.7+.
    CREATION_FLAGS = getattr(subprocess, "CREATE_NO_WINDOW", 0x08000000)  # type: ignore[attr-defined]
