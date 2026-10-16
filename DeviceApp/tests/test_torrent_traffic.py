from pathlib import Path
import sqlite3
import sys
import tempfile
import unittest
from unittest.mock import Mock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from torrent_traffic import TorrentTraffic, RETENTION
import control_api as api


class TrafficTests(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.path = Path(temp.name) / 'traffic.sqlite3'
        self.rpc = Mock()
        self.history = TorrentTraffic(self.path, self.rpc)
        self.now = 1800000000

    def sample(self, offset, down=0, up=0, session=1):
        self.rpc.call.return_value = {'cumulative-stats': {'downloadedBytes': down, 'uploadedBytes': up, 'sessionCount': session},
                                      'downloadSpeed': 123, 'uploadSpeed': 45}
        self.history.sample(self.now + offset)

    def test_counter_deltas_not_instantaneous_rates_define_totals(self):
        self.sample(0, 1000, 100)
        self.sample(30, 31000, 3100)
        result = self.history.snapshot(now=self.now + 30)
        self.assertEqual(result['totals'], {'downloadedBytes': 30000, 'uploadedBytes': 3000, 'observedSeconds': 30})
        measured = [p for p in result['points'] if p['downloadRate'] is not None]
        self.assertTrue(measured)
        self.assertTrue(all(p['downloadRate'] == 1000 and p['uploadRate'] == 100 for p in measured))
        self.assertEqual(result['current']['downloadRate'], 123)
        self.assertFalse(result['stale'])

    def test_retains_history_after_restart_without_attributing_offline_bytes(self):
        self.sample(0)
        self.sample(30, 3000, 300)
        self.history = TorrentTraffic(self.path, self.rpc)
        self.sample(3600, 900000, 90000)
        self.sample(3630, 906000, 90600)
        result = self.history.snapshot(now=self.now + 3630)
        self.assertEqual(result['totals']['downloadedBytes'], 9000)
        self.assertEqual(result['totals']['observedSeconds'], 60)
        self.assertTrue(any(p['downloadRate'] is None for p in result['points']))

    def test_reset_and_observation_gaps_do_not_create_spikes(self):
        self.sample(0, 900000, 90000)
        self.sample(30, 0, 0, session=2)
        self.sample(60, 3000, 300, session=2)
        self.sample(200, 800000, 80000, session=2)
        self.sample(230, 100, 10, session=2)
        result = self.history.snapshot(now=self.now + 230)
        self.assertEqual(result['totals']['downloadedBytes'], 3000)
        self.assertEqual(result['totals']['observedSeconds'], 30)

    def test_aggregation_preserves_totals_across_views_and_bucket_boundaries(self):
        self.sample(0)
        for offset in range(30, 900, 30):
            self.sample(offset, offset * 1000, offset * 100)
        for period in ('3h', '24h', '7d'):
            result = self.history.snapshot(period, self.now + 870)
            self.assertEqual(result['totals']['downloadedBytes'], 870000)
            self.assertEqual(result['totals']['observedSeconds'], 870)
            self.assertLessEqual(len(result['points']), 182)

    def test_window_boundary_prorates_interval_and_retention_is_bounded(self):
        self.sample(0)
        self.sample(30, 30000, 3000)
        result = self.history.snapshot('3h', self.now + 10815)
        self.assertEqual(result['totals']['downloadedBytes'], 15000)
        self.assertEqual(result['totals']['observedSeconds'], 15)
        self.sample(RETENTION + 200, 999999, 99999)
        with sqlite3.connect(self.path) as db:
            self.assertEqual(db.execute('SELECT COUNT(*) FROM samples').fetchone()[0], 1)

    def test_idle_is_zero_but_missing_data_is_null_and_stale(self):
        self.assertTrue(self.history.snapshot(now=self.now)['stale'])
        self.sample(0)
        self.sample(30)
        result = self.history.snapshot(now=self.now + 200)
        self.assertTrue(result['stale'])
        self.assertTrue(any(p['downloadRate'] == 0 for p in result['points']))
        self.assertTrue(any(p['downloadRate'] is None for p in result['points']))

    def test_invalid_period_and_counters(self):
        with self.assertRaises(ValueError):
            self.history.snapshot('forever')
        for invalid in (-1, float('nan'), True):
            with self.assertRaises(ValueError):
                self.sample(0, invalid)

    def test_sampler_failure_marks_stale_and_recovery_starts_a_new_interval(self):
        self.sample(0)
        self.sample(30, 3000, 300)
        with patch.object(self.rpc, 'call', side_effect=OSError('offline')), patch('torrent_traffic.time.sleep', side_effect=InterruptedError), patch('torrent_traffic.logging.getLogger'):
            with self.assertRaises(InterruptedError):
                self.history._run()
        self.assertTrue(self.history.snapshot(now=self.now + 35)['stale'])
        self.sample(60, 9000, 900)
        result = self.history.snapshot(now=self.now + 60)
        self.assertFalse(result['stale'])
        self.assertEqual(result['totals']['downloadedBytes'], 3000)

    def test_start_does_not_create_duplicate_samplers(self):
        with patch('torrent_traffic.threading.Thread') as thread:
            thread.return_value.is_alive.return_value = True
            self.history.start()
            self.history.start()
            thread.assert_called_once()
            thread.return_value.start.assert_called_once()

    def test_api_auth_validation_and_read_errors(self):
        manager = Mock(traffic=self.history)
        with api.app.test_client() as client, patch.object(api, 'get_movie_torrents', return_value=manager):
            with patch.object(api, 'is_authorized_request', return_value=False):
                self.assertEqual(client.get('/torrents/traffic').status_code, 401)
            with patch.object(api, 'is_authorized_request', return_value=True):
                self.assertEqual(client.get('/torrents/traffic?period=7d').status_code, 200)
                self.assertEqual(client.get('/torrents/traffic?period=bad').status_code, 400)
                with patch.object(self.history, 'snapshot', side_effect=sqlite3.OperationalError('read failure')), patch.object(api.app.logger, 'exception'):
                    self.assertEqual(client.get('/torrents/traffic').status_code, 503)


if __name__ == '__main__':
    unittest.main()
