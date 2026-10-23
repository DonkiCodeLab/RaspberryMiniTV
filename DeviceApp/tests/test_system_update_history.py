import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import run_system_update
import system_update
import system_update_history as history


class UpdateHistoryTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.repo = self.root / "repo"
        self.repo.mkdir()
        self.path = self.root / "persistent" / "history.jsonl"
        patcher = patch.object(history, "HISTORY_PATH", self.path)
        patcher.start()
        self.addCleanup(patcher.stop)
        self.git("init")
        self.git("config", "user.name", "Update Test")
        self.git("config", "user.email", "test@example.invalid")
        self.commit("Versión inicial")

    def git(self, *args):
        return subprocess.run(["git", *args], cwd=self.repo, check=True,
                              capture_output=True, text=True).stdout.strip()

    def commit(self, subject, body=""):
        args = ["commit", "--allow-empty", "-m", subject]
        if body:
            args.extend(["-m", body])
        self.git(*args)
        return self.git("rev-parse", "HEAD")

    def record(self, previous, exit_code=0):
        return history.record_update(self.repo, started_at="2026-10-22T08:00:00+00:00",
                                     previous_commit=previous, exit_code=exit_code)

    def test_records_only_incorporated_commits_with_subjects_and_full_descriptions(self):
        previous = history.current_commit(self.repo)
        first = self.commit("Mejora las fotos", "Carga más rápida.\n\nConserva los álbumes.")
        second = self.commit("Corrige los subtítulos")
        entry = self.record(previous)
        self.assertEqual(entry["state"], "succeeded")
        self.assertEqual(entry["previousCommit"], previous)
        self.assertEqual(entry["commit"], second)
        self.assertEqual([item["hash"] for item in entry["commits"]], [second, first])
        self.assertEqual(entry["commits"][0]["body"], "")
        self.assertEqual(entry["commits"][1]["subject"], "Mejora las fotos")
        self.assertEqual(entry["commits"][1]["body"], "Carga más rápida.\n\nConserva los álbumes.")
        self.assertEqual(history.read_history(), [entry])
        self.assertEqual(self.path.stat().st_mode & 0o777, 0o644)

    def test_keeps_all_runs_newest_first_and_retains_last_success_after_failure_and_reboot(self):
        previous = history.current_commit(self.repo)
        with patch.object(history, "timestamp", return_value="2026-10-22T08:05:06+00:00"):
            success = self.record(previous)
        with patch.object(history, "timestamp", return_value="2026-10-22T09:05:06+00:00"):
            failure = self.record(previous, exit_code=1)
        self.assertEqual(success["commits"], [])
        self.assertEqual(failure["state"], "failed")
        # After reboot systemd forgets the last invocation; the on-disk history remains.
        output = "LoadState=loaded\nActiveState=inactive\nExecMainStartTimestamp="
        with patch.object(system_update.subprocess, "run", return_value=subprocess.CompletedProcess([], 0, output)):
            status = system_update.update_status()
        self.assertEqual(status["state"], "idle")
        self.assertEqual(status["history"], [failure, success])
        self.assertEqual(status["lastUpdatedAt"], success["completedAt"])

    def test_missing_and_damaged_history_do_not_discard_valid_entries(self):
        self.assertEqual(history.read_history(), [])
        entry = self.record(history.current_commit(self.repo))
        with self.path.open("a") as output:
            output.write('\nnot JSON\n[]\n{"state":"succeeded","completedAt":"invalid"}\n{"interrupted":')
        latest = self.record(history.current_commit(self.repo))
        self.assertEqual(history.read_history(), [latest, entry])

    def test_unavailable_git_metadata_is_distinct_from_an_unchanged_checkout(self):
        self.assertIsNone(history.update_commits(self.repo, "", history.current_commit(self.repo)))
        with patch.object(history, "git_output", return_value=None):
            entry = self.record("missing")
        self.assertEqual(entry["state"], "succeeded")
        self.assertIsNone(entry["commits"])

    def test_runner_records_completion_without_a_browser_or_api_poll(self):
        # Run only a harmless fixture script: no real updater, installers or services.
        (self.repo / "update_minitv.sh").write_text("#!/bin/bash\nexit 0\n")
        with patch.dict(os.environ, {"MINITV_REPO_DIR": str(self.repo), "INVOCATION_ID": "fixture-success"}):
            self.assertEqual(run_system_update.main(), 0)
        (self.repo / "update_minitv.sh").write_text("#!/bin/bash\nexit 7\n")
        with patch.dict(os.environ, {"MINITV_REPO_DIR": str(self.repo), "INVOCATION_ID": "fixture-failure"}):
            self.assertEqual(run_system_update.main(), 7)
        entries = history.read_history()
        self.assertEqual([entry["state"] for entry in entries], ["failed", "succeeded"])
        self.assertEqual(entries[0]["runId"], "fixture-failure")
        self.assertEqual(entries[0]["exitCode"], 7)
        self.assertEqual(len([line for line in self.path.read_text().splitlines() if line]), 2)

    def test_start_keeps_history_visible_in_the_response(self):
        entry = self.record(history.current_commit(self.repo))
        with patch.object(system_update, "update_status", return_value={"state": "succeeded", "history": [entry], "lastUpdatedAt": entry["completedAt"]}), patch.object(system_update.subprocess, "run"):
            result = system_update.start_update()
        self.assertEqual(result["state"], "running")
        self.assertEqual(result["history"], [entry])
        self.assertEqual(result["lastUpdatedAt"], entry["completedAt"])


if __name__ == "__main__":
    unittest.main()
