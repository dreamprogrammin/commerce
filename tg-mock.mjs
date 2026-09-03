/** Заглушка Telegram API: пишет вызовы в файл, отвечает ok. */
import http from 'node:http'
import fs from 'node:fs'
http.createServer((req, res) => {
  let body = ''
  req.on('data', c => (body += c))
  req.on('end', () => {
    fs.appendFileSync('/app/tg-calls.jsonl', JSON.stringify({
      method: req.url.split('/').pop(), body: body ? JSON.parse(body) : null,
    }) + '\n')
    const method = req.url.split('/').pop()
    // getMe отвечает как настоящий Telegram: боту нужен свой ник, чтобы
    // собрать ссылку «написать в личку».
    const result = method === 'getMe'
      ? { id: 1, is_bot: true, username: 'uhti_test_bot', first_name: 'Ухтышка' }
      : { message_id: 999 }
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: true, result }))
  })
}).listen(8790, '0.0.0.0', () => console.log('mock on 8790'))
