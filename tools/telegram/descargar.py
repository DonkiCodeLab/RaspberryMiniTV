#!/usr/bin/env python3
"""Lista y descarga documentos de chats accesibles con tu cuenta de Telegram."""
import argparse
import asyncio
import getpass
import logging
import os
from pathlib import Path
import re
import sqlite3
import time

BASE = Path(__file__).resolve().parent
STATUS = 'Preparando conexión'


def status(message):
    global STATUS
    STATUS = message
    print(message, flush=True)


async def run_with_feedback(args):
    async def heartbeat():
        while True:
            await asyncio.sleep(15)
            print(f'  En curso: {STATUS}', flush=True)

    task = asyncio.create_task(heartbeat())
    try:
        await main(args)
    finally:
        task.cancel()
        await asyncio.gather(task, return_exceptions=True)


def download_progress():
    started = time.monotonic()
    last = -float('inf')

    def report(current, total):
        nonlocal last
        now = time.monotonic()
        if now - last < 1 and current != total:
            return
        last = now
        speed = current / max(now - started, 0.001) / 1048576
        percent = 100 * current / total if total else 0
        print(f'  {percent:5.1f}% · {current / 1048576:.2f}/'
              f'{(total or 0) / 1048576:.2f} MB · {speed:.2f} MB/s', flush=True)
    return report


def history_options(topic):
    options = dict(limit=None, wait_time=1)
    # General no es un hilo normal: conserva el filtrado local para ese tema.
    if topic is not None and topic != 1:
        options['reply_to'] = topic
    return options


def load_local_env():
    """Carga solo las credenciales conocidas; el entorno explícito tiene prioridad."""
    env_file = BASE / '.env'
    if not env_file.is_file():
        return
    for line in env_file.read_text(encoding='utf-8').splitlines():
        key, separator, value = line.strip().partition('=')
        if separator and key in ('TG_API_ID', 'TG_API_HASH'):
            os.environ.setdefault(key, value.strip())


def safe_name(name):
    name = re.sub(r'[\\/\x00-\x1f\x7f:*?"<>|]', '_', name).strip(' .')
    # Mantener el componente por debajo del límite de bytes habitual del disco.
    return (name.encode('utf-8')[:180].decode('utf-8', 'ignore') or 'archivo')


def topic_id(message):
    reply = message.reply_to
    if reply and getattr(reply, 'forum_topic', False):
        return getattr(reply, 'reply_to_top_id', None) or reply.reply_to_msg_id
    return 1


async def list_topics(client, entity, contains='', limit=None):
    from telethon import functions

    offset_date, offset_id, offset_topic = None, 0, 0
    seen = set()
    count = 0
    while True:
        result = await client(functions.messages.GetForumTopicsRequest(
            peer=entity, offset_date=offset_date, offset_id=offset_id,
            offset_topic=offset_topic, limit=100))
        topics = [topic for topic in result.topics if hasattr(topic, 'title')]
        if not topics:
            break
        fresh = [topic for topic in topics if topic.id not in seen]
        if not fresh:
            raise SystemExit('Telegram repitió una página antes de alcanzar el total '
                             'de temas. Los temas mostrados son válidos, pero el '
                             'listado puede estar incompleto. Vuelve a intentarlo.')
        for topic in fresh:
            seen.add(topic.id)
            if contains.casefold() in topic.title.casefold():
                print(f'tema={topic.id}\t{topic.title}', flush=True)
                count += 1
                if limit and count >= limit:
                    return
        # No solicitar otra página una vez recibido el total informado por Telegram.
        # El filtro de nombres afecta a count, pero no al total de temas recibidos.
        if len(seen) >= result.count:
            break
        last = topics[-1]
        offset_id, offset_topic = last.top_message, last.id
        if getattr(result, 'order_by_create_date', False):
            offset_date = last.date
        else:
            message = next((m for m in result.messages if m.id == last.top_message), None)
            if message is None:
                message = await client.get_messages(entity, ids=last.top_message)
            if message is None or not getattr(message, 'date', None):
                raise RuntimeError('No se pudo paginar el listado de temas.')
            offset_date = message.date
    print(f'{count} temas encontrados.')


def arguments():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('accion', choices=['chats', 'temas', 'listar', 'descargar'])
    parser.add_argument('--chat', help='ID obtenido con chats o @nombrepublico')
    parser.add_argument('--tema', type=int, help='ID de tema mostrado por listar')
    parser.add_argument('--extension', help='Extensiones separadas por comas: zip,7z')
    parser.add_argument('--contiene', default='', help='Texto en el nombre del archivo o tema')
    parser.add_argument('--limite', type=int, help='Máximo de archivos o temas coincidentes')
    parser.add_argument('--destino', type=Path, default=BASE / 'data' / 'descargas')
    args = parser.parse_args()
    if args.accion != 'chats' and not args.chat:
        parser.error('--chat es obligatorio para temas, listar y descargar')
    if args.limite is not None and args.limite < 1:
        parser.error('--limite debe ser positivo')
    return args


async def main(args):
    try:
        from telethon import TelegramClient, errors, utils
    except ImportError:
        raise SystemExit('Instala las dependencias: python -m pip install -r requirements.txt')

    # La sesión permite acceder a la cuenta: archivos privados desde su creación.
    os.umask(0o077)
    session_dir = BASE / 'data'
    session_dir.mkdir(parents=True, exist_ok=True)
    load_local_env()
    api_id = int(os.environ.get('TG_API_ID') or input('Telegram api_id: '))
    api_hash = os.environ.get('TG_API_HASH') or getpass.getpass('Telegram api_hash: ')
    logging.basicConfig(level=logging.WARNING, format='%(levelname)s: %(message)s')
    # Telethon informa aquí de las pausas automáticas impuestas por Telegram.
    logging.getLogger('telethon.client.users').setLevel(logging.INFO)
    status('Conectando con Telegram…')
    if args.accion == 'descargar':
        args.destino = args.destino.expanduser().resolve()
        print(f'Carpeta base de descargas: {args.destino}', flush=True)
    client = TelegramClient(str(session_dir / 'cuenta'), api_id, api_hash,
                            flood_sleep_threshold=86400)
    async with client:
        if args.accion == 'chats':
            async for dialog in client.iter_dialogs():
                print(f'{dialog.id}\t{dialog.name}')
            return
        chat = int(args.chat) if re.fullmatch(r'-?\d+', args.chat) else args.chat
        status(f'Buscando el chat {chat}…')
        try:
            entity = await client.get_entity(chat)
        except ValueError:
            # Solo recorre los diálogos si la sesión aún no conoce el chat.
            if not isinstance(chat, int):
                raise
            async for dialog in client.iter_dialogs():
                if dialog.id == chat:
                    break
            entity = await client.get_entity(chat)
        if args.accion == 'temas':
            await list_topics(client, entity, args.contiene, args.limite)
            return
        chat_id = utils.get_peer_id(entity)
        extensions = {'.' + x.strip().lower().lstrip('.')
                      for x in (args.extension or '').split(',') if x.strip()}
        db = None
        if args.accion == 'descargar':
            args.destino = args.destino.expanduser().resolve()
            args.destino.mkdir(parents=True, exist_ok=True)
            db = sqlite3.connect(args.destino / 'registro.sqlite3')
            db.execute('CREATE TABLE IF NOT EXISTS completed '
                       '(chat INTEGER, message INTEGER, document TEXT, path TEXT, size INTEGER, '
                       'PRIMARY KEY (chat, message))')
            folder = args.destino / str(chat_id)
            if args.tema is not None:
                folder /= f'tema_{args.tema}'
            folder.mkdir(parents=True, exist_ok=True)
            print(f'Destino: {folder}', flush=True)
        count = total = failures = downloaded = skipped = scanned = 0
        status(f'Consultando archivos del tema {args.tema}…' if args.tema not in (None, 1)
               else 'Recorriendo el historial del grupo…')
        try:
            async for msg in client.iter_messages(entity, **history_options(args.tema)):
                scanned += 1
                if scanned % 100 == 0:
                    status(f'Revisados {scanned} mensajes; {count} archivos coincidentes; '
                           f'{downloaded} descargados; {skipped} ya guardados.')
                if not msg.document or not msg.file:
                    continue
                topic = topic_id(msg)
                name = msg.file.name or f'archivo_{msg.id}{msg.file.ext or ""}'
                size = msg.file.size
                if args.tema is not None and topic != args.tema:
                    continue
                if extensions and Path(name).suffix.lower() not in extensions:
                    continue
                if args.contiene.casefold() not in name.casefold():
                    continue
                count += 1
                total += size
                print(f'mensaje={msg.id} tema={topic} {size / 1048576:.2f} MB {name}', flush=True)
                if db is not None:
                    folder = args.destino / str(chat_id) / f'tema_{topic}'
                    folder.mkdir(parents=True, exist_ok=True)
                    target = folder / f'{msg.id}_{msg.document.id}_{safe_name(name)}'
                    record = db.execute('SELECT document, path, size FROM completed '
                                        'WHERE chat=? AND message=?', (chat_id, msg.id)).fetchone()
                    if (record == (str(msg.document.id), str(target), size)
                            and target.is_file() and target.stat().st_size == size):
                        print('  Ya descargado.')
                        skipped += 1
                    elif target.exists():
                        print('  Conflicto con archivo sin registro válido; no se sobrescribe.')
                        failures += 1
                    else:
                        partial = target.with_name(target.name + '.part')
                        try:
                            while True:
                                try:
                                    status(f'Descargando: {name}')
                                    await client.download_media(msg, file=str(partial),
                                                                progress_callback=download_progress())
                                    break
                                except errors.FloodWaitError as exc:
                                    print(f'  Telegram solicita esperar {exc.seconds} segundos.', flush=True)
                                    await asyncio.sleep(exc.seconds)
                            if not partial.is_file() or partial.stat().st_size != size:
                                raise OSError('Descarga incompleta; vuelve a ejecutar para reintentar')
                            partial.replace(target)
                            db.execute('INSERT OR REPLACE INTO completed VALUES (?, ?, ?, ?, ?)',
                                       (chat_id, msg.id, str(msg.document.id), str(target), size))
                            db.commit()
                            downloaded += 1
                            status(f'Guardado ({downloaded} nuevos): {target}')
                        except (errors.RPCError, OSError) as exc:
                            failures += 1
                            print(f'  Error: {exc}', flush=True)
                if args.limite and count >= args.limite:
                    break
        finally:
            if db is not None:
                db.close()
        print(f'{count} archivos coincidentes; {total / 1048576:.2f} MB; '
              f'{downloaded} nuevos; {skipped} ya guardados; {failures} errores.', flush=True)
        if failures:
            raise SystemExit(1)


if __name__ == '__main__':
    try:
        asyncio.run(run_with_feedback(arguments()))
    except KeyboardInterrupt:
        print('\nInterrumpido. Los archivos completados quedan registrados.')
