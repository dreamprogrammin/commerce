/**
 * Заглушка Anthropic API для локальной проверки `generate-brand-seo`.
 *
 * Возвращает ответ нужной формы и записывает полученный запрос в файл —
 * так видно и собранные функцией факты, и сам промпт, не тратя обращения
 * к настоящей модели.
 *
 * Запускать ОБЯЗАТЕЛЬНО контейнером в сети локального Supabase: edge-runtime
 * живёт в докере, и до хоста (ни по localhost, ни по шлюзу сети) он не
 * достучится.
 *
 *   sg docker -c "docker run -d --name anthropic-mock \
 *     --network supabase_network_gvsdevsvzgcivpphcuai \
 *     -e OUT=/app/mock-request.json -v <каталог>:/app -w /app \
 *     node:22 node mock-anthropic.mjs"
 *
 * Режим ответа читается из файла `mode.txt` рядом: `ok` (по умолчанию),
 * `refusal` или `max_tokens` — чтобы проверить ветки ошибок.
 */
import http from 'node:http'
import fs from 'node:fs'

const OUT = process.env.OUT || '/tmp/mock-request.json'

const server = http.createServer((req, res) => {
  let body = ''
  req.on('data', c => (body += c))
  req.on('end', () => {
    fs.writeFileSync(OUT, body)
    const parsed = JSON.parse(body || '{}')
    const facts = JSON.parse(parsed.messages[0].content.replace(/^Данные о брендах:\s*/, ''))

    const brands = facts.map((f, i) => ({
      brand_id: f.id,
      meta_title: i === 0
        ? `Конструкторы ${f.name} — купить в Алматы | Ухтышка`
        : `Очень длинный заголовок про ${f.name}, который заведомо не влезает в шестьдесят знаков | Ухтышка`,
      seo_h1: `Конструкторы ${f.name}`,
      seo_description: `${f.name} в Алматы: ${f.products_count} моделей от ${f.min_price} ₸. Доставка за 1 день, самовывоз, бонусы за покупку.`,
      description: f.has_description
        ? ''
        : `<h2 data-icon="fluent-emoji-flat:rocket">${f.name}</h2><p>Текст про бренд.</p><script>alert(1)</script>`,
    }))

    // Режим заглушки читается из файла — чтобы менять его между вызовами,
    // не пересоздавая контейнер.
    let mode = 'ok'
    try { mode = fs.readFileSync('/app/mode.txt', 'utf8').trim() || 'ok' } catch {}

    if (mode !== 'ok') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({
        id: 'msg_mock', type: 'message', role: 'assistant', model: 'claude-opus-5-mock',
        content: mode === 'refusal' ? [] : [{ type: 'text', text: '{"brands":[{"brand_id":"x"' }],
        stop_reason: mode,
        stop_details: mode === 'refusal' ? { type: 'refusal', category: 'other' } : null,
        usage: { input_tokens: 10, output_tokens: 10 },
      }))
      return
    }

    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({
      id: 'msg_mock',
      type: 'message',
      role: 'assistant',
      model: 'claude-opus-5-mock',
      content: [{ type: 'text', text: JSON.stringify({ brands }) }],
      stop_reason: 'end_turn',
      usage: { input_tokens: 1234, output_tokens: 567 },
    }))
  })
})
server.listen(8788, '0.0.0.0', () => console.log('заглушка на 8788'))
