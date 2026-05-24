"""
cloud_sync.py — modular cloud sync for the agent's memory context.

The agent keeps its working memory in a structured ``memory.json``. This module
saves / overwrites that file to one of four cloud backends, chosen at runtime:

    MEMORY_BACKEND = gdrive_cli | gdrive_api | onedrive | dropbox | icloud

Switch backend with the ``MEMORY_BACKEND`` env var, or pass ``provider=`` to
:func:`sync_memory`. Optional third-party libraries (google-api-python-client,
dropbox) are imported lazily *inside* each method, so importing this module
never fails just because one SDK is missing.

Quick use in your loop:

    from hands.memory.cloud_sync import sync_memory
    sync_memory(agent_memory_dict)                 # uses MEMORY_BACKEND env
    sync_memory(agent_memory_dict, provider="dropbox")

Hybrid model (sensitive stays local, rest goes to cloud) — see
:func:`sync_memory_hybrid` at the bottom.
"""

from __future__ import annotations

import json
import os
import platform
import shutil
import subprocess
from abc import ABC, abstractmethod
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, Optional


# ─────────────────────────────────────────────────────────────────────────────
# CONFIG — paste your tokens / IDs / emails here, OR set the matching env vars.
# Env vars always win over the defaults below.
# ─────────────────────────────────────────────────────────────────────────────
@dataclass
class CloudConfig:
    # Local working copy of memory.json (written before every upload).
    local_memory_path: str = os.getenv("MEMORY_LOCAL_PATH", "memory.json")

    # ── 1. GOOGLE DRIVE ──────────────────────────────────────────────────────
    # Method A (CLI / GAM): the Google Workspace user and target Drive folder.
    gam_user_email: str = os.getenv("GAM_USER_EMAIL", "you@yourdomain.com")          # <-- PASTE your GAM user email
    gam_binary: str = os.getenv("GAM_BINARY", "gam")                                  # path to the `gam` executable
    gdrive_folder_id: str = os.getenv("GDRIVE_FOLDER_ID", "PASTE_DRIVE_FOLDER_ID")    # <-- PASTE the Drive folder id

    # Method B (API / service account):
    gdrive_service_account_json: str = os.getenv(
        "GDRIVE_SERVICE_ACCOUNT_JSON", "service_account.json"                          # <-- PASTE path to SA key file
    )
    # If you already created memory.json once, paste its file id to overwrite it.
    # Leave blank to create-or-find it inside the parent folder automatically.
    gdrive_file_id: str = os.getenv("GDRIVE_FILE_ID", "")
    gdrive_parent_id: str = os.getenv("GDRIVE_FOLDER_ID", "PASTE_DRIVE_FOLDER_ID")     # parent folder for the API method

    # ── 2. MICROSOFT ONEDRIVE (mgc CLI) ──────────────────────────────────────
    mgc_binary: str = os.getenv("MGC_BINARY", "mgc")                                  # path to Microsoft Graph CLI
    # OneDrive item path. Format: "root:/<folder>/<file>:"
    onedrive_item_path: str = os.getenv("ONEDRIVE_ITEM_PATH", "root:/AIAgent/memory.json:")

    # ── 3. DROPBOX (API) ─────────────────────────────────────────────────────
    dropbox_access_token: str = os.getenv("DROPBOX_ACCESS_TOKEN", "PASTE_DROPBOX_ACCESS_TOKEN")  # <-- PASTE token
    dropbox_dest_path: str = os.getenv("DROPBOX_DEST_PATH", "/AIAgent/memory.json")    # must start with "/"

    # ── 4. APPLE iCLOUD (local file system, macOS only) ──────────────────────
    # Path is relative to the iCloud Drive container.
    icloud_relative_path: str = os.getenv("ICLOUD_RELATIVE_PATH", "AIAgent/memory.json")


# ─────────────────────────────────────────────────────────────────────────────
# Base backend
# ─────────────────────────────────────────────────────────────────────────────
class MemoryBackend(ABC):
    """One cloud destination for memory.json."""

    name: str = "base"

    def __init__(self, config: Optional[CloudConfig] = None) -> None:
        self.cfg = config or CloudConfig()

    @abstractmethod
    def save(self, memory: Dict[str, Any]) -> bool:
        """Serialize ``memory`` and push it to the backend. Return success bool."""
        raise NotImplementedError

    # Shared helper: write the local memory.json that uploads read from.
    def _write_local(self, memory: Dict[str, Any]) -> Path:
        path = Path(self.cfg.local_memory_path).expanduser()
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(memory, indent=2, ensure_ascii=False), encoding="utf-8")
        return path

    @staticmethod
    def _ok(msg: str) -> bool:
        print(f"[memory-sync] [ok] {msg}")
        return True

    @staticmethod
    def _err(msg: str) -> bool:
        print(f"[memory-sync] [!] {msg}")
        return False


# ─────────────────────────────────────────────────────────────────────────────
# 1A. Google Drive — CLI (GAM)
#     gam user <email> add drivefile localfile memory.json parentid <folder_id>
# ─────────────────────────────────────────────────────────────────────────────
class GoogleDriveCLIBackend(MemoryBackend):
    name = "gdrive_cli"

    def save(self, memory: Dict[str, Any]) -> bool:
        try:
            local = self._write_local(memory)
        except OSError as exc:
            return self._err(f"could not write local memory.json: {exc}")

        cmd = [
            self.cfg.gam_binary, "user", self.cfg.gam_user_email,
            "add", "drivefile",
            "localfile", str(local),
            "parentid", self.cfg.gdrive_folder_id,
        ]
        try:
            result = subprocess.run(
                cmd, capture_output=True, text=True, timeout=120, check=False
            )
        except FileNotFoundError:
            return self._err(
                f"GAM CLI not found (looked for '{self.cfg.gam_binary}'). "
                "Install GAM and/or set GAM_BINARY to its full path."
            )
        except subprocess.TimeoutExpired:
            return self._err("GAM CLI timed out after 120s.")

        if result.returncode != 0:
            return self._err(f"GAM failed (exit {result.returncode}): {result.stderr.strip() or result.stdout.strip()}")
        return self._ok(f"uploaded via GAM to folder {self.cfg.gdrive_folder_id}")


# ─────────────────────────────────────────────────────────────────────────────
# 1B. Google Drive — API (service account, googleapiclient)
# ─────────────────────────────────────────────────────────────────────────────
class GoogleDriveAPIBackend(MemoryBackend):
    name = "gdrive_api"

    def save(self, memory: Dict[str, Any]) -> bool:
        # Lazy import so the module loads without google-api-python-client present.
        try:
            from google.oauth2 import service_account  # type: ignore
            from googleapiclient.discovery import build  # type: ignore
            from googleapiclient.http import MediaFileUpload  # type: ignore
        except ImportError:
            return self._err(
                "Missing deps. Install: "
                "pip install google-api-python-client google-auth"
            )

        try:
            local = self._write_local(memory)
        except OSError as exc:
            return self._err(f"could not write local memory.json: {exc}")

        try:
            creds = service_account.Credentials.from_service_account_file(
                self.cfg.gdrive_service_account_json,             # <-- PASTE path in CloudConfig
                scopes=["https://www.googleapis.com/auth/drive"],
            )
            service = build("drive", "v3", credentials=creds, cache_discovery=False)
            media = MediaFileUpload(str(local), mimetype="application/json", resumable=False)

            file_id = self.cfg.gdrive_file_id.strip()
            # If no explicit file id, look for an existing memory.json in the parent.
            if not file_id:
                query = (
                    "name = 'memory.json' and trashed = false "
                    f"and '{self.cfg.gdrive_parent_id}' in parents"
                )
                found = service.files().list(
                    q=query, fields="files(id)", pageSize=1
                ).execute().get("files", [])
                file_id = found[0]["id"] if found else ""

            if file_id:
                service.files().update(fileId=file_id, media_body=media).execute()
                return self._ok(f"overwrote Drive file {file_id} via API")

            created = service.files().create(
                body={"name": "memory.json", "parents": [self.cfg.gdrive_parent_id]},
                media_body=media,
                fields="id",
            ).execute()
            return self._ok(f"created Drive file {created.get('id')} via API")
        except FileNotFoundError:
            return self._err(
                f"service account json not found at '{self.cfg.gdrive_service_account_json}'."
            )
        except Exception as exc:  # googleapiclient raises many error types
            return self._err(f"Drive API error: {exc}")


# ─────────────────────────────────────────────────────────────────────────────
# 2. Microsoft OneDrive — mgc CLI
#    mgc users drive items root content put --item-id "root:/AIAgent/memory.json:" --body-file ./memory.json
# ─────────────────────────────────────────────────────────────────────────────
class OneDriveCLIBackend(MemoryBackend):
    name = "onedrive"

    def save(self, memory: Dict[str, Any]) -> bool:
        try:
            local = self._write_local(memory)
        except OSError as exc:
            return self._err(f"could not write local memory.json: {exc}")

        cmd = [
            self.cfg.mgc_binary, "users", "drive", "items", "root", "content", "put",
            "--item-id", self.cfg.onedrive_item_path,
            "--body-file", str(local),
        ]
        try:
            result = subprocess.run(
                cmd, capture_output=True, text=True, timeout=120, check=False
            )
        except FileNotFoundError:
            return self._err(
                f"Microsoft Graph CLI not found (looked for '{self.cfg.mgc_binary}'). "
                "Install `mgc` and run `mgc login`, or set MGC_BINARY."
            )
        except subprocess.TimeoutExpired:
            return self._err("mgc CLI timed out after 120s.")

        if result.returncode != 0:
            return self._err(f"mgc failed (exit {result.returncode}): {result.stderr.strip() or result.stdout.strip()}")
        return self._ok(f"uploaded to OneDrive at {self.cfg.onedrive_item_path}")


# ─────────────────────────────────────────────────────────────────────────────
# 3. Dropbox — API (dropbox SDK, overwrite)
# ─────────────────────────────────────────────────────────────────────────────
class DropboxAPIBackend(MemoryBackend):
    name = "dropbox"

    def save(self, memory: Dict[str, Any]) -> bool:
        try:
            import dropbox  # type: ignore
        except ImportError:
            return self._err("Missing dep. Install: pip install dropbox")

        token = self.cfg.dropbox_access_token                 # <-- PASTE token in CloudConfig
        if not token or token.startswith("PASTE_"):
            return self._err("DROPBOX_ACCESS_TOKEN is not set.")

        try:
            data = json.dumps(memory, indent=2, ensure_ascii=False).encode("utf-8")
            dbx = dropbox.Dropbox(token)
            dbx.users_get_current_account()  # fails fast on a bad/expired token
            dbx.files_upload(
                data,
                self.cfg.dropbox_dest_path,
                mode=dropbox.files.WriteMode.overwrite,
            )
            return self._ok(f"uploaded to Dropbox at {self.cfg.dropbox_dest_path}")
        except dropbox.exceptions.AuthError:
            return self._err("Dropbox auth failed — token invalid or expired.")
        except Exception as exc:
            return self._err(f"Dropbox API error: {exc}")


# ─────────────────────────────────────────────────────────────────────────────
# 4. Apple iCLOUD — local file system (macOS only)
#    ~/Library/Mobile Documents/com~apple~CloudDocs/AIAgent/memory.json
# ─────────────────────────────────────────────────────────────────────────────
class ICloudLocalBackend(MemoryBackend):
    name = "icloud"

    def save(self, memory: Dict[str, Any]) -> bool:
        if platform.system() != "Darwin":
            return self._err("iCloud local sync only works on macOS.")

        container = Path.home() / "Library" / "Mobile Documents" / "com~apple~CloudDocs"
        if not container.exists():
            return self._err(f"iCloud Drive container not found at {container}.")

        dest = container / self.cfg.icloud_relative_path
        try:
            self._write_local(memory)  # keep a local working copy too
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(self.cfg.local_memory_path, dest)
            return self._ok(f"saved to iCloud at {dest}")
        except OSError as exc:
            return self._err(f"iCloud write failed: {exc}")


# ─────────────────────────────────────────────────────────────────────────────
# Factory + public API
# ─────────────────────────────────────────────────────────────────────────────
_BACKENDS = {
    GoogleDriveCLIBackend.name: GoogleDriveCLIBackend,
    GoogleDriveAPIBackend.name: GoogleDriveAPIBackend,
    OneDriveCLIBackend.name: OneDriveCLIBackend,
    DropboxAPIBackend.name: DropboxAPIBackend,
    ICloudLocalBackend.name: ICloudLocalBackend,
}


def get_backend(provider: Optional[str] = None, config: Optional[CloudConfig] = None) -> MemoryBackend:
    """Resolve a backend by name (or MEMORY_BACKEND env). Raises on unknown name."""
    name = (provider or os.getenv("MEMORY_BACKEND", "icloud")).strip().lower()
    if name not in _BACKENDS:
        raise ValueError(
            f"Unknown MEMORY_BACKEND '{name}'. Choose one of: {', '.join(_BACKENDS)}"
        )
    return _BACKENDS[name](config)


def sync_memory(
    memory: Dict[str, Any],
    provider: Optional[str] = None,
    config: Optional[CloudConfig] = None,
) -> bool:
    """Save the agent's memory dict to the configured cloud backend.

    Drop this into your loop:  sync_memory(self.memory)
    """
    backend = get_backend(provider, config)
    print(f"[memory-sync] backend = {backend.name}")
    return backend.save(memory)


# Keys whose values stay on this machine only and never leave for the cloud.
# Extend to match your memory schema (tokens, PII, local paths, etc.).
SENSITIVE_KEYS = {"secrets", "credentials", "tokens", "pii", "local_paths"}


def sync_memory_hybrid(
    memory: Dict[str, Any],
    cloud_provider: Optional[str] = None,
    local_path: str = "memory.local.json",
    sensitive_keys: Optional[set] = None,
    config: Optional[CloudConfig] = None,
) -> bool:
    """Hybrid storage: sensitive keys stay local, the rest goes to the cloud.

    - Sensitive subset → written to ``local_path`` only.
    - Everything else  → uploaded to ``cloud_provider`` (or MEMORY_BACKEND).
    """
    keys = sensitive_keys or SENSITIVE_KEYS
    sensitive = {k: v for k, v in memory.items() if k in keys}
    shareable = {k: v for k, v in memory.items() if k not in keys}

    try:
        lp = Path(local_path).expanduser()
        lp.parent.mkdir(parents=True, exist_ok=True)
        lp.write_text(json.dumps(sensitive, indent=2, ensure_ascii=False), encoding="utf-8")
        print(f"[memory-sync] [ok] sensitive keys kept local at {lp} ({len(sensitive)} key(s))")
    except OSError as exc:
        print(f"[memory-sync] [!] could not write local sensitive memory: {exc}")
        return False

    return sync_memory(shareable, provider=cloud_provider, config=config)


if __name__ == "__main__":
    # Smoke test: MEMORY_BACKEND=icloud python -m hands.memory.cloud_sync
    demo = {"summary": "agent online", "facts": ["built repo", "wired memory sync"]}
    ok = sync_memory(demo)
    raise SystemExit(0 if ok else 1)
