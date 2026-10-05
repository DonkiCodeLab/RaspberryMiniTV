import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import control_api as api


class SubtitleControlTests(unittest.TestCase):
    def setUp(self):
        for name in ('ensure_media_directories', 'is_authorized_request'):
            mocked = patch.object(api, name, return_value=True)
            mocked.start()
            self.addCleanup(mocked.stop)
        self.client = api.app.test_client()
        self.tracks = [
            {'type': 'audio', 'id': 1},
            {'type': 'sub', 'id': 2, 'lang': 'spa'},
            {'type': 'sub', 'id': 7, 'title': 'Alien.srt', 'external': True},
        ]
        self.selected = 2
        self.visible = True
        self.commands = []

    def mpv(self, *args):
        self.commands.append(args)
        if args[0] == 'get_property':
            value = {'track-list': self.tracks, 'sid': self.selected, 'sub-visibility': self.visible}[args[1]]
            return {'error': 'success', 'data': value}
        if args[1] == 'sid':
            self.selected = args[2]
        if args[1] == 'sub-visibility':
            self.visible = args[2]
        return {'error': 'success'}

    def send(self, action):
        return self.client.post('/playback/subtitles', json={'action': action})

    def test_toggle_off_and_back_on_preserves_track(self):
        with patch.object(api, 'send_mpv_command', side_effect=self.mpv):
            self.assertFalse(self.send('toggle').json['enabled'])
            result = self.send('toggle').json
        self.assertTrue(result['enabled'])
        self.assertEqual(result['track']['id'], 2)
        self.assertEqual(self.selected, 2)

    def test_enable_when_no_track_selected(self):
        self.selected = False
        with patch.object(api, 'send_mpv_command', side_effect=self.mpv):
            result = self.send('toggle').json
        self.assertTrue(result['enabled'])
        self.assertEqual(result['track']['id'], 2)

    def test_next_cycles_embedded_and_external_without_disabling(self):
        self.visible = False
        with patch.object(api, 'send_mpv_command', side_effect=self.mpv):
            external = self.send('next').json
            embedded = self.send('next').json
        self.assertTrue(external['enabled'])
        self.assertTrue(external['track']['external'])
        self.assertEqual(external['track']['id'], 7)
        self.assertEqual(embedded['track']['id'], 2)
        self.assertFalse(embedded['track']['external'])

    def test_no_subtitles_and_no_playback_report_errors(self):
        self.tracks = []
        with patch.object(api, 'send_mpv_command', side_effect=self.mpv):
            self.assertEqual(self.send('toggle').json['code'], 'subtitle_none')
        with patch.object(api, 'send_mpv_command', return_value=None), patch.object(api, 'read_playback_state', return_value={}):
            self.assertEqual(self.send('toggle').json['code'], 'subtitle_not_playing')

    def test_kodi_actions_and_delivery_failure(self):
        with patch.object(api, 'send_mpv_command', return_value=None), patch.object(api, 'read_playback_state', return_value={'backend': 'kodi'}), patch.object(api, 'player_is_running', return_value=True), patch.object(api.shutil, 'which', return_value='/usr/bin/kodi-send'), patch.object(api.subprocess, 'run', return_value=SimpleNamespace(returncode=0)) as run:
            self.assertTrue(self.send('toggle').json['queued'])
            self.assertEqual(run.call_args.args[0][-1], '--action=ShowSubtitles')
            self.assertTrue(self.send('next').json['queued'])
            self.assertEqual(run.call_args.args[0][-1], '--action=NextSubtitle')
            run.return_value = SimpleNamespace(returncode=1)
            self.assertEqual(self.send('next').status_code, 503)

    def test_invalid_actions_never_reach_player(self):
        with patch.object(api, 'send_mpv_command') as send:
            self.assertEqual(self.send('quit').status_code, 400)
            self.assertEqual(self.client.post('/playback/subtitles', json=['next']).status_code, 400)
            send.assert_not_called()

    def test_player_command_failure_is_not_reported_as_success(self):
        def fail(*args):
            return {'error': 'property unavailable'} if args[0] == 'set_property' else self.mpv(*args)
        with patch.object(api, 'send_mpv_command', side_effect=fail):
            self.assertEqual(self.send('toggle').status_code, 503)


if __name__ == '__main__':
    unittest.main()
