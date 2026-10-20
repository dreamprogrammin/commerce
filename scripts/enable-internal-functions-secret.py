#!/usr/bin/env python3
"""Шаг 3 защиты функций бота: секрет базы → окружение функций (19.10.2026).

Запуск из корня репозитория: python3 -I scripts/enable-internal-functions-secret.py
Нужен токен Management API в ~/.supabase/access-token (supabase login).
Порядок и контекст — docs/HANDOFF.md, раздел «защита функций бота».

1. Читает internal_functions_secret из Vault прод-базы. Значение не печатается.
2. Заводит его секретом функций INTERNAL_FUNCTIONS_SECRET и сверяет отпечаток.
3. Ждёт, пока синхронизация статуса начнёт требовать секрет: подделка «pg_net»
   должна получить 403. До этого подделка безвредна: тело — битый JSON,
   функция падает на разборе и ничего не делает.
4. Настоящий путь: net.http_post из базы с internal_function_headers() в
   синхронизацию статуса. Заказ с нулевым id → 200 «нечего обновлять».
   Не 200 или любой сбой до этого места → секрет удаляется (прежнее поведение).
5. Остальные подделки — тоже 403.

sales-digest и team-report подделкой не проверяются: пока секрет не доехал,
такая проверка отправила бы сводку. Их проверит расписание (22:00 и 9:00).

Откат вручную: DELETE /v1/projects/<ref>/secrets ["INTERNAL_FUNCTIONS_SECRET"].
"""
import hashlib
import json
import os
import time
import urllib.error
import urllib.request

REF = 'gvsdevsvzgcivpphcuai'
API = f'https://api.supabase.com/v1/projects/{REF}'
FN = f'https://{REF}.supabase.co/functions/v1'
NAME = 'INTERNAL_FUNCTIONS_SECRET'
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


def sql(query):
    return mgmt('POST', '/database/query', {'query': query})


def rollback(reason):
    try:
        mgmt('DELETE', '/secrets', [NAME])
    except RuntimeError as e:
        raise SystemExit(f'СБОЙ: {reason}. ОТКАТ НЕ ПРОШЁЛ ({e}) — удалите {NAME} вручную.') from None
    raise SystemExit(f'ОТКАТ: {reason}. Секрет {NAME} удалён — функции работают по-старому.')


def forged(fn, headers, body):
    return http('POST', f'{FN}/{fn}', body, headers)[0]


PG_NET = {'User-Agent': 'pg_net/0.19.5', 'Content-Type': 'application/json'}

# 1. Значение из Vault — до любых изменений
rows = sql("select decrypted_secret as v from vault.decrypted_secrets where name = 'internal_functions_secret'")
value = (rows[0].get('v') if rows else '') or ''
if len(value) != 64:
    raise SystemExit('Секрета internal_functions_secret в Vault нет или он не той длины — ничего не менял.')
if any(s['name'] == NAME for s in mgmt('GET', '/secrets')):
    raise SystemExit(f'{NAME} уже заведён — ничего не менял.')

# 2. В окружение функций. Дальше любой сбой до подтверждённого 200 из базы — откат.
mgmt('POST', '/secrets', [{'name': NAME, 'value': value}])
try:
    listed = {s['name']: s.get('value') for s in mgmt('GET', '/secrets')}
    if listed.get(NAME) != hashlib.sha256(value.encode()).hexdigest():
        rollback('отпечаток секрета функций не совпал с Vault')
    print(f'1. {NAME} заведён, отпечаток совпадает с Vault')

    # 3. Ждём, пока функция увидит секрет
    t0 = time.time()
    status = forged('sync-order-status-to-telegram', PG_NET, b'x')
    while status != 403 and time.time() - t0 < 180:
        time.sleep(5)
        status = forged('sync-order-status-to-telegram', PG_NET, b'x')
    print(f'2. Подделка «pg_net» → синхронизация статуса: {status}'
          + (f' (секрет доехал за {int(time.time() - t0)} с)' if status == 403 else '  ← НЕ 403'))
    if status != 403:
        # База шлёт заголовок в любом случае, так что ничего не сломано.
        raise SystemExit('Секрет не доехал до функции за 3 минуты. Функции пока работают по-старому.')

    # 4. Настоящий путь — из базы через pg_net с секретом
    payload = json.dumps({'record': {'id': '00000000-0000-0000-0000-000000000000', 'status': 'processing'},
                          'old_record': {'status': 'new'}, 'table': 'orders'})
    rid = sql(f"select net.http_post(url := '{FN}/sync-order-status-to-telegram', "
              f"headers := public.internal_function_headers(), body := '{payload}'::jsonb) as id")[0]['id']
    resp = []
    for _ in range(45):
        time.sleep(2)
        resp = sql('select status_code, timed_out, error_msg, left(content, 120) as content '
                   f'from net._http_response where id = {int(rid)}')
        if resp:
            break
    code = resp[0]['status_code'] if resp else None
    print(f'3. База → функция через pg_net с секретом: {code} '
          f'{resp[0]["content"] if resp else "(ответа нет за 90 с)"}')
    if code != 200:
        rollback(f'настоящий вызов из базы получил {code}, ждали 200')
except (RuntimeError, ValueError, KeyError, IndexError, TypeError) as e:
    rollback(f'сбой проверки: {e}')

# 5. Остальные подделки. Сбой здесь отката не требует: база уже прошла.
print('4. Остальные подделки:')
for fn, headers, body, label in [
    ('notify-order-to-telegram', PG_NET, b'x', 'подделка «pg_net» → уведомление о заказе'),
    ('send-user-telegram', {'Content-Type': 'application/json'}, b'{}', 'без ключа → сообщение от имени бота'),
    ('notify-question-answered', {'Content-Type': 'application/json'}, b'x', 'без секрета → уведомление об ответе'),
]:
    t1 = time.time()
    status = forged(fn, headers, body)
    while status != 403 and time.time() - t1 < 120:
        time.sleep(5)
        status = forged(fn, headers, body)
    print(f'   {label}: {status}' + ('' if status == 403 else '  ← НЕ 403'))

print('Готово: база шлёт секрет, функции его требуют.')
