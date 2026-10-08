import subprocess
import json
import tempfile
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import system_update
import control_api as api


class UpdateTests(unittest.TestCase):
    def test_progress_belongs_to_current_run_and_survives_api_restart(self):
        with tempfile.TemporaryDirectory() as directory:
            progress = Path(directory) / 'progress.json'
            output = 'LoadState=loaded\nActiveState=activating\nInvocationID=current'
            with patch.object(system_update, 'PROGRESS_PATH', progress), patch.object(system_update.subprocess, 'run', return_value=subprocess.CompletedProcess([], 0, output)):
                self.assertIsNone(system_update.update_status()['phase'])
                progress.write_text(json.dumps({'runId': 'previous', 'phase': 'building'}))
                self.assertIsNone(system_update.update_status()['phase'])
                for phase in system_update.PHASES:
                    progress.write_text(json.dumps({'runId': 'current', 'phase': phase}))
                    self.assertEqual(system_update.update_status()['phase'], phase)
                for data in ['broken JSON', '[]', '{"runId":"current","phase":"unknown"}']:
                    progress.write_text(data)
                    self.assertIsNone(system_update.update_status()['phase'])

    def test_systemd_states(self):
        cases = [
            ('LoadState=not-found\nActiveState=inactive', 'unavailable'),
            ('LoadState=loaded\nActiveState=activating\nResult=success', 'running'),
            ('LoadState=loaded\nActiveState=active\nSubState=exited\nResult=success', 'succeeded'),
            ('LoadState=loaded\nActiveState=inactive\nResult=success\nExecMainStartTimestamp=', 'idle'),
            ('LoadState=loaded\nActiveState=inactive\nResult=success\nExecMainStartTimestamp=today', 'succeeded'),
            ('LoadState=loaded\nActiveState=failed\nResult=exit-code\nExecMainStatus=1', 'failed'),
            ('LoadState=loaded\nActiveState=failed\nResult=timeout', 'failed'),
        ]
        for output, expected in cases:
            with self.subTest(expected=expected), patch.object(system_update.subprocess, 'run', return_value=subprocess.CompletedProcess([], 0, output)):
                self.assertEqual(system_update.update_status()['state'], expected)

    def test_duplicate_start_does_not_launch_again(self):
        with patch.object(system_update, 'update_status', return_value={'state': 'running'}), patch.object(system_update.subprocess, 'run') as run:
            self.assertEqual(system_update.start_update()['state'], 'running')
            run.assert_not_called()

    def test_start_uses_only_fixed_unit_and_no_block(self):
        with patch.object(system_update, 'update_status', return_value={'state': 'failed'}), patch.object(system_update.subprocess, 'run') as run:
            system_update.start_update()
            self.assertEqual(run.call_args.args[0], ['systemctl', 'restart', '--no-block', 'minitv-update.service'])

    def test_missing_service_cannot_start(self):
        with patch.object(system_update, 'update_status', return_value={'state': 'unavailable'}), patch.object(system_update.subprocess, 'run') as run:
            with self.assertRaises(RuntimeError):
                system_update.start_update()
            run.assert_not_called()

    def test_endpoints_require_pin_and_do_not_accept_commands(self):
        client = api.app.test_client()
        with patch.object(api, 'current_web_pin', return_value='test-pin'), patch.object(system_update, 'start_update', return_value={'state': 'running'}) as start:
            self.assertEqual(client.post('/system/update').status_code, 401)
            self.assertEqual(client.get('/system/update').status_code, 401)
            start.assert_not_called()
            response = client.post('/system/update', headers={'X-Web-Pin': 'test-pin'}, json={'command': 'anything'})
            self.assertEqual(response.status_code, 202)
            self.assertEqual(response.headers['Cache-Control'], 'no-store')
            start.assert_called_once_with()

    def test_status_is_available_after_api_restart_and_errors_are_reported(self):
        client = api.app.test_client()
        with patch.object(api, 'current_web_pin', return_value='test-pin'), patch.object(system_update, 'update_status', return_value={'state': 'succeeded'}):
            self.assertEqual(client.get('/system/update', headers={'X-Web-Pin': 'test-pin'}).json['state'], 'succeeded')
        with patch.object(api, 'current_web_pin', return_value='test-pin'), patch.object(system_update, 'start_update', side_effect=subprocess.TimeoutExpired('systemctl', 10)):
            self.assertEqual(client.post('/system/update', headers={'X-Web-Pin': 'test-pin'}).status_code, 503)


if __name__ == '__main__':
    unittest.main()
