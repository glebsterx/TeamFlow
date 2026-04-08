"""Bootstrap — auto-generate secrets and ensure minimal config on startup."""
import os
import secrets
import shutil
import logging
from datetime import datetime
from pathlib import Path

logger = logging.getLogger(__name__)

DEFAULT_SECRET_KEY = "change-this-secret-key-in-production"

DB_FILE = "/app/data/teamflow.db"
BACKUP_DIR = "/app/data/backups"
MAX_BACKUPS = 10


def _read_env_file(path: str = "/app/.env") -> dict[str, str]:
    """Read .env file into dict."""
    env = {}
    if not os.path.exists(path):
        return env
    with open(path, "r") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            if "=" in line:
                key, _, value = line.partition("=")
                env[key.strip()] = value.strip()
    return env


def _write_env_var(path: str, key: str, value: str):
    """Append or update a single env var in .env file."""
    env = _read_env_file(path)
    if key in env:
        # Rewrite the file with updated value
        lines = []
        with open(path, "r") as f:
            for line in f:
                stripped = line.strip()
                if stripped.startswith(f"{key}="):
                    lines.append(f"{key}={value}\n")
                else:
                    lines.append(line)
        with open(path, "w") as f:
            f.writelines(lines)
    else:
        # Append
        with open(path, "a") as f:
            f.write(f"{key}={value}\n")
    logger.info(f"[bootstrap] {key} written to .env")


def bootstrap_secret_key():
    """Generate SECRET_KEY if still default."""
    current = os.environ.get("SECRET_KEY", DEFAULT_SECRET_KEY)
    if current == DEFAULT_SECRET_KEY:
        new_key = secrets.token_urlsafe(48)
        os.environ["SECRET_KEY"] = new_key
        try:
            _write_env_var("/app/.env", "SECRET_KEY", new_key)
        except Exception as e:
            logger.warning(f"[bootstrap] Could not write SECRET_KEY to .env: {e}")
        logger.info("[bootstrap] SECRET_KEY auto-generated")


def bootstrap_vapid_keys():
    """VAPID keys are now stored in DB (app_settings), not .env.

    Initial generation happens at runtime when the first push subscription is created
    or via the settings UI. No file-based bootstrap needed.
    """
    pass  # Keys are managed via vapid_service and settings UI


def backup_database():
    """Auto-backup SQLite database at startup. Keeps last MAX_BACKUPS."""
    if not os.path.exists(DB_FILE):
        logger.info("[bootstrap] No database file found, skipping backup")
        return

    try:
        os.makedirs(BACKUP_DIR, exist_ok=True)
        timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
        backup_file = os.path.join(BACKUP_DIR, f"teamflow-{timestamp}.db")
        shutil.copy2(DB_FILE, backup_file)
        logger.info(f"[bootstrap] Database backed up to {backup_file}")

        # Clean old backups
        backups = sorted(
            [f for f in os.listdir(BACKUP_DIR) if f.startswith("teamflow-") and f.endswith(".db")],
            reverse=True,
        )
        for old in backups[MAX_BACKUPS:]:
            os.remove(os.path.join(BACKUP_DIR, old))
            logger.info(f"[bootstrap] Removed old backup: {old}")
    except Exception as e:
        logger.warning(f"[bootstrap] Database backup failed: {e}")
