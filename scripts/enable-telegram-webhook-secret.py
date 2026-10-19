#!/usr/bin/env python3
"""Шаг 4 защиты функций бота: секрет вебхука Telegram (19.10.2026).

Запуск из корня репозитория: python3 -I scripts/enable-telegram-webhook-secret.py
Нужен токен Management API в ~/.supabase/access-token (supabase login).
Порядок и контекст — docs/HANDOFF.md, раздел «защита функций бота».

Только ПОСЛЕ выкатки telegram-webhook, где `/setup` передаёт secret_token.
Иначе первое же `/setup` поставит вебхук без секрета, функция начнёт отвечать
401 на всё, и бот замолчит. Скрипт проверяет это сам.

1. Скачивает развёрнутый telegram-webhook и ищет в `/setup` передачу секрета.
   Её нет — ничего не меняет.
2. Заводит случайный TELEGRAM_WEBHOOK_SECRET в секретах функций. Значение не
   печатается и не сохраняется: оно нужно только функции и Telegram.
3. Ждёт, пока функция увидит секрет, и вызывает ?action=secure-webhook.
   Функция сама вызывает setWebhook с прежним адресом и этим secret_token.
   Не вышло за 3 минуты или любой сбой — секрет удаляется, бот работает
   по-старому.
4. Проверка: обновление без заголовка и с чужим секретом получают 401.

Между шагами 2 и 3 Telegram получает 401 и сам повторяет доставку, так что
обновления не теряются.

Откат вручную: DELETE /v1/projects/<ref>/secrets ["TELEGRAM_WEBHOOK_SECRET"].
Telegram продолжит слать заголовок, а функция без секрета его не проверяет.
"""
import json
import os
import secrets
import subprocess
import tempfile
import time
import urllib.error
import urllib.request

REF = 'gvsdevsvzgcivpphcuai'
API = f'https://api.supabase.com/v1/projects/{REF}'
FN = f'https://{REF}.supabase.co/functions/v1'
NAME = 'TELEGRAM_WEBHOOK_SECRET'
SUPABASE = os.path.expanduser('~/bin/supabase')
with open(os.path.expanduser('~/.supabase/access-token')) as f:
    TOKEN = f.read().strip()


def http(method, url, data=None, headers=None):
    """(код, тело). Сетевой сбой — код 0: его тоже надо отличать от ответа."""
    req = urllib.request.Request(url, data=data, method=method,
                                 headers={'User-Agent': 'uhti-rollout/1.0', **(headers or {})})
    try:
        with urllib.request.urlopen(req, timeout=90) as r:
            return r.status, r.read().decode()
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()
    except OSError as e:
        return 0, f'сеть: {e}'


def mgmt(method, path, body=None):
    status, text = http(method, API + path,
                        None if body is None else json.dumps(body).encode(),
                        {'Authorization': f'Bearer {TOKEN}', 'Content-Type': 'application/json'})
    if not 200 <= status < 300:
        raise RuntimeError(f'Management API {method} {path}: {status} {text[:300]}')
    return json.loads(text) if text.strip() else None


def rollback(reason):
    try:
        mgmt('DELETE', '/secrets', [NAME])
    except RuntimeError as e:
        raise SystemExit(f'СБОЙ: {reason}. ОТКАТ НЕ ПРОШЁЛ ({e}) — удалите {NAME} вручную.') from None
    raise SystemExit(f'ОТКАТ: {reason}. Секрет {NAME} удалён — бот работает по-старому.')


# 1. На бою `/setup` уже передаёт секрет?
with tempfile.TemporaryDirectory() as tmp:
    r = subprocess.run([SUPABASE, 'functions', 'download', 'telegram-webhook', '--project-ref', REF,
                        '--use-api', '--workdir', tmp], capture_output=True, text=True)
    if r.returncode:
        raise SystemExit(f'Не скачал telegram-webhook: {(r.stderr or r.stdout)[-300:]} Ничего не менял.')
    with open(os.path.join(tmp, 'supabase/functions/telegram-webhook/index.ts'), encoding='utf-8') as f:
        src = f.read()
if '...webhookSecretParams()' not in src:
    raise SystemExit('На бою telegram-webhook без правки `/setup` — сначала выкатить её. Ничего не менял.')
print('1. На бою `/setup` передаёт secret_token')

if any(s['name'] == NAME for s in mgmt('GET', '/secrets')):
    raise SystemExit(f'{NAME} уже заведён — второй раз не ставлю. Ничего не менял.')

# 2. Секрет
secret = secrets.token_hex(32)
mgmt('POST', '/secrets', [{'name': NAME, 'value': secret}])
print(f'2. {NAME} заведён')

# 3. Вебхук с секретом — его ставит сама функция: токен бота есть только у неё.
# Ключ — заголовком: адрес запроса оседает в журнале функций. Любой сбой до
# подтверждения от Telegram — откат, иначе бот останется глухим.
try:
    url = f'{FN}/telegram-webhook?action=secure-webhook'
    key = {'x-webhook-key': secret}
    t0 = time.time()
    status, text = http('GET', url, headers=key)
    while status in (0, 404) and time.time() - t0 < 180:
        time.sleep(3)
        status, text = http('GET', url, headers=key)
    if status != 200:
        rollback(f'secure-webhook ответил {status}: {text[:200]}')
    info = json.loads(text)
except (RuntimeError, ValueError) as e:
    rollback(f'сбой при постановке вебхука: {e}')
print(f"3. Вебхук переставлен через {int(time.time() - t0)} с: адрес прежний — "
      f"{'да' if info.get('url_unchanged') else 'НЕТ'}, ждут доставки — {info.get('pending_update_count')}, "
      f"последняя ошибка Telegram — {info.get('last_error_message') or 'нет'}")


# 4. Чужие обновления больше не проходят. Сбой здесь отката не требует:
# Telegram уже шлёт секрет, функция его уже ждёт.
def post(headers):
    return http('POST', f'{FN}/telegram-webhook', b'{"update_id": 0}',
                {'Content-Type': 'application/json', **headers})[0]


t1 = time.time()
bare = post({})
while bare != 401 and time.time() - t1 < 120:
    time.sleep(5)
    bare = post({})
wrong = post({'X-Telegram-Bot-Api-Secret-Token': 'wrong'})
print(f'4. Обновление без заголовка: {bare}, с чужим секретом: {wrong}'
      + ('' if bare == wrong == 401 else '  ← ждали 401'))
print('Готово. Нажмите любую кнопку в боте или отправьте ему /start — он должен ответить как обычно.')
