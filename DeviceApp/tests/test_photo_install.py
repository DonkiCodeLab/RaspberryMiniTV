"""Run the installer with fake OS commands, without apt, root or service changes."""
import os
from pathlib import Path
import subprocess
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[1]


class PhotoInstallTests(unittest.TestCase):
    def run_installer(self, faces=True, ready=False, fail=False, restart=True):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            bin_dir = root / 'bin'; bin_dir.mkdir()
            runtime = root / 'runtime'; (runtime / 'bin').mkdir(parents=True)
            service = root / 'minitv-api.service'; service.touch()
            log = root / 'calls'
            python = runtime / 'bin/python'
            python.write_text('''#!/bin/bash
echo "python $*" >> "$PHOTO_TEST_LOG"
if [[ "$*" == *"pip install"* ]]; then
  echo "threads=$CMAKE_BUILD_PARALLEL_LEVEL" >> "$PHOTO_TEST_LOG"
  [[ "${PHOTO_TEST_FAIL:-}" != 1 ]] || exit 1
  touch "$PHOTO_TEST_READY"
fi
[[ -f "$PHOTO_TEST_READY" ]]
''')
            python.chmod(0o755)
            for command in ('apt-get', 'systemctl', 'flock'):
                file = bin_dir / command
                file.write_text('#!/bin/bash\necho "' + command + ' $*" >> "$PHOTO_TEST_LOG"\n')
                file.chmod(0o755)
            file = bin_dir / 'uname'; file.write_text('#!/bin/bash\necho Linux\n'); file.chmod(0o755)
            marker = root / 'ready'
            if ready: marker.touch()
            script = (ROOT / 'install_photo_support.sh').read_text()
            script = script.replace('${EUID}', '0').replace('/opt/minitv-photo-python', str(runtime))
            script = script.replace('/etc/systemd/system/minitv-api.service', str(service))
            script = script.replace('/run/minitv-photo-install.lock', str(root / 'lock'))
            script = script.replace('/usr/bin/python3 -m venv --system-site-packages "${PHOTO_RUNTIME}"', ':')
            installer = root / 'installer.sh'; installer.write_text(script)
            args = ['bash', str(installer)] + (['--faces'] if faces else []) + ([] if restart else ['--no-restart'])
            result = subprocess.run(args, env={**os.environ, 'PATH': str(bin_dir) + ':' + os.environ['PATH'],
                'PHOTO_TEST_LOG': str(log), 'PHOTO_TEST_READY': str(marker), 'PHOTO_TEST_FAIL': '1' if fail else '0'},
                capture_output=True, text=True)
            override = Path(str(service) + '.d') / 'photos.conf'
            return result, log.read_text(), override.read_text() if override.exists() else ''

    def test_fresh_faces_install_checks_models_before_service_restart(self):
        result, calls, override = self.run_installer()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn('requirements-photo-faces.txt', calls)
        self.assertIn('threads=1', calls)
        self.assertLess(calls.rindex('photo_faces.py --check'), calls.index('systemctl restart'))
        self.assertIn('runtime/bin/python', override)

    def test_updater_defers_restart_and_does_not_reinstall_working_runtime(self):
        result, calls, override = self.run_installer(ready=True, restart=False)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertNotIn('apt-get', calls)
        self.assertNotIn('pip install', calls)
        self.assertNotIn('systemctl restart', calls)
        self.assertIn('photo_faces.py --check', calls)
        self.assertTrue(override)

    def test_failed_install_keeps_running_api_and_override_untouched(self):
        result, calls, override = self.run_installer(fail=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertNotIn('systemctl', calls)
        self.assertFalse(override)


if __name__ == '__main__': unittest.main()
