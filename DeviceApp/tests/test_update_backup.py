"""Exercise the updater's Git backup with private device settings present."""
import os
from pathlib import Path
import subprocess
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[2]


class UpdateBackupTests(unittest.TestCase):
    def test_private_settings_are_preserved_and_code_is_stashed(self):
        with tempfile.TemporaryDirectory() as directory:
            repo = Path(directory)
            def git(*args):
                return subprocess.run(['git', *args], cwd=repo, check=True,
                                      capture_output=True, text=True).stdout
            git('init')
            git('config', 'user.name', 'Updater Test')
            git('config', 'user.email', 'updater@example.invalid')
            (repo / 'code.txt').write_text('original')
            (repo / '.gitignore').write_text('DeviceApp/user_settings.json\nDeviceApp/subtitle_settings.json\n')
            git('add', 'code.txt', '.gitignore')
            git('commit', '-m', 'initial')
            (repo / 'code.txt').write_text('local change')
            (repo / 'new-code.txt').write_text('new code')
            (repo / 'DeviceApp').mkdir()
            for name in ('user_settings.json', 'subtitle_settings.json'):
                (repo / 'DeviceApp' / name).write_text('existing private settings')
            settings = repo / 'DeviceApp/game_settings.json'
            settings.write_text('private device credentials')
            settings.chmod(0)
            # Reproduce an old checkout that ignores some settings but not games.
            # No installers, network access or service calls run.
            script = (ROOT / 'update_minitv.sh').read_text()
            backup = script[script.index('UPDATE_EXCLUDE='):script.index('if [[ ! -f "${NEOCD_CORE_PATH}"')]
            try:
                subprocess.run(['bash', '-euc', 'log() { :; }\nrepo_command() { "$@"; }\n' + backup], cwd=repo,
                               check=True, capture_output=True, text=True)
                self.assertTrue(settings.exists())
                self.assertEqual(settings.stat().st_mode & 0o777, 0)
                self.assertEqual((repo / 'code.txt').read_text(), 'original')
                self.assertFalse((repo / 'new-code.txt').exists())
                self.assertEqual(git('show', 'stash:code.txt'), 'local change')
                self.assertEqual(git('ls-tree', '-r', '--name-only', 'stash^3').strip(), 'new-code.txt')
                for name in ('user_settings.json', 'subtitle_settings.json'):
                    self.assertEqual((repo / 'DeviceApp' / name).read_text(), 'existing private settings')
            finally:
                settings.chmod(0o600)
            self.assertEqual(settings.read_text(), 'private device credentials')

    def test_repository_commands_delegate_to_configured_user(self):
        # Isolate the real shell wrapper and record runuser's argv.
        script = (ROOT / 'update_minitv.sh').read_text()
        wrapper = script[script.index('repo_command()'):script.index('type -P git')]
        shell = '''
getent() { printf 'device:x:1000:1000::/home/device:/bin/bash\\n'; }
runuser() { printf '%s\\n' "$@"; }
fail() { exit 1; }
'''
        # The wrapper's branch depends on Bash's read-only EUID; replace only
        # that platform input, leaving command construction intact.
        wrapper = wrapper.replace('${EUID}', '0')
        result = subprocess.run(['bash', '-euc', shell + wrapper + '\ngit fetch origin main\nnpm run build'],
                                env={**os.environ, 'MINITV_UPDATE_USER': 'device'},
                                check=True, capture_output=True, text=True)
        self.assertEqual(result.stdout.splitlines(), [
            '-u', 'device', '--', 'env', 'HOME=/home/device', 'git', 'fetch', 'origin', 'main',
            '-u', 'device', '--', 'env', 'HOME=/home/device', 'npm', 'run', 'build'])


if __name__ == '__main__':
    unittest.main()
