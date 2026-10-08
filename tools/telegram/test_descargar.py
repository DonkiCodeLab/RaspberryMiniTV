import asyncio
from contextlib import redirect_stdout
import io
import os
from pathlib import Path
from tempfile import TemporaryDirectory
from types import SimpleNamespace as S
import unittest
from unittest.mock import patch

import descargar


class DownloadTests(unittest.TestCase):
    def test_topic_scope(self):
        self.assertEqual(descargar.history_options(60977)['reply_to'], 60977)
        self.assertNotIn('reply_to', descargar.history_options(1))
        self.assertNotIn('reply_to', descargar.history_options(None))

    def test_progress(self):
        with redirect_stdout(io.StringIO()) as output:
            descargar.download_progress()(1024, 1024)
        self.assertIn('100.0%', output.getvalue())
        self.assertIn('MB/s', output.getvalue())

    def test_download_then_skip(self):
        calls = []
        message = S(id=42, document=S(id=99),
                    file=S(name='juego.bin', size=4),
                    reply_to=S(forum_topic=True, reply_to_top_id=60977))

        class Client:
            def __init__(self, *args, **kwargs): pass
            async def __aenter__(self): return self
            async def __aexit__(self, *args): pass
            async def get_entity(self, chat): return S()
            async def iter_messages(self, entity, **kwargs):
                assert kwargs['reply_to'] == 60977
                yield message
            async def download_media(self, msg, file, progress_callback):
                calls.append(msg.id)
                Path(file).write_bytes(b'data')
                progress_callback(4, 4)

        with TemporaryDirectory() as temp:
            args = S(accion='descargar', chat='-1002130477987', tema=60977,
                     extension=None, contiene='', limite=None, destino=Path(temp)/'out')
            with (patch.object(descargar, 'BASE', Path(temp)),
                  patch.dict(os.environ, TG_API_ID='123', TG_API_HASH='test'),
                  patch('telethon.TelegramClient', Client),
                  patch('telethon.utils.get_peer_id', return_value=-1002130477987),
                  redirect_stdout(io.StringIO()) as output):
                asyncio.run(descargar.run_with_feedback(args))
                asyncio.run(descargar.run_with_feedback(args))
            self.assertEqual(calls, [42])
            self.assertIn('Destino:', output.getvalue())
            self.assertIn('1 ya guardados', output.getvalue())
            target = args.destino/'-1002130477987'/'tema_60977'/'42_99_juego.bin'
            self.assertEqual(target.read_bytes(), b'data')


if __name__ == '__main__':
    unittest.main()
