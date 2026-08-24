"""Test backup_database()'s raise_on_error flag — the whole admin-alert
mechanism in app/telegram/backup_scheduler.py depends on this actually
propagating the exception instead of swallowing it like the startup path does."""
import os
import tempfile
import pytest

from app.core import bootstrap


@pytest.fixture
def fake_db_file(monkeypatch):
    with tempfile.TemporaryDirectory() as tmp:
        db_file = os.path.join(tmp, "teamflow.db")
        with open(db_file, "w") as f:
            f.write("fake db content")
        monkeypatch.setattr(bootstrap, "DB_FILE", db_file)
        yield tmp, db_file


def test_backup_raise_on_error_false_swallows_failure(fake_db_file, monkeypatch):
    tmp, db_file = fake_db_file
    # Point backups at a path that can't be created (parent doesn't exist and
    # os.makedirs would need permissions we don't have as a normal user)
    monkeypatch.setattr(bootstrap, "BACKUP_DIR", "/root/unwritable-backups")
    bootstrap.backup_database(raise_on_error=False)  # must not raise


def test_backup_raise_on_error_true_propagates_failure(fake_db_file, monkeypatch):
    tmp, db_file = fake_db_file
    monkeypatch.setattr(bootstrap, "BACKUP_DIR", "/root/unwritable-backups")
    with pytest.raises(Exception):
        bootstrap.backup_database(raise_on_error=True)


def test_backup_succeeds_and_rotates(fake_db_file, monkeypatch):
    tmp, db_file = fake_db_file
    backup_dir = os.path.join(tmp, "backups")
    os.makedirs(backup_dir)
    monkeypatch.setattr(bootstrap, "BACKUP_DIR", backup_dir)
    monkeypatch.setattr(bootstrap, "MAX_BACKUPS", 2)

    # Pre-seed 3 older backups (distinct names — backup_database() itself
    # would overwrite same-second timestamps, that's not what's under test
    # here) — one fresh run should push the total over MAX_BACKUPS and prune.
    for ts in ["20260101-000000", "20260102-000000", "20260103-000000"]:
        with open(os.path.join(backup_dir, f"teamflow-{ts}.db"), "w") as f:
            f.write("old backup")

    bootstrap.backup_database(raise_on_error=True)

    backups = [f for f in os.listdir(backup_dir) if f.startswith("teamflow-")]
    assert len(backups) == 2
    # Keeps the newest by filename (which embeds the timestamp) — the 2026-01-03
    # seed and today's fresh backup, not the two oldest seeds.
    assert "teamflow-20260101-000000.db" not in backups
    assert "teamflow-20260102-000000.db" not in backups
