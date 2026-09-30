import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { computed, createSSRApp, h, ref } from 'vue'
import { renderToString } from 'vue/server-renderer'

/**
 * Ответы FAQ бренда — в серверной разметке.
 *
 * Ответ рисовался через `v-if` и появлялся в HTML только после нажатия:
 * поисковик и ИИ видели одни вопросы, около 33 страниц брендов. Нашёл аудит
 * 30 сентября 2026. Теперь ответ всегда в разметке и скрыт стилем, пока
 * вопрос не раскрыт.
 */

Object.assign(globalThis, { computed, ref })

const QUESTIONS = [
  { id: 'q1', question_text: 'Где купить CaDA в Алматы?', answer_text: 'В Ухтышке, самовывоз из Шапагата.' },
  { id: 'q2', question_text: 'С какого возраста?', answer_text: 'С 6 лет, возраст указан в карточке.' },
  { id: 'q3', question_text: 'Без ответа?', answer_text: '  ' },
]

const Icon = { render: () => h('i') }

async function load() {
  return (await import('@/components/brand/BrandFaqList.vue')).default
}

describe('brandFaqList', () => {
  it('ответы есть в серверной разметке, пока вопросы закрыты', async () => {
    const BrandFaqList = await load()
    const app = createSSRApp({ render: () => h(BrandFaqList, { questions: QUESTIONS, brandName: 'CaDA' }) })
    app.component('Icon', Icon)
    const html = await renderToString(app)
    expect(html).toContain('В Ухтышке, самовывоз из Шапагата.')
    expect(html).toContain('С 6 лет, возраст указан в карточке.')
    // Вопрос без ответа не выводится вовсе
    expect(html).not.toContain('Без ответа?')
  })

  it('закрытый ответ скрыт, по нажатию раскрывается один', async () => {
    const BrandFaqList = await load()
    const wrapper = mount(BrandFaqList, {
      props: { questions: QUESTIONS, brandName: 'CaDA' },
      global: { stubs: { Icon } },
    })
    const answers = wrapper.findAll('.bfq__answer')
    expect(answers).toHaveLength(2)
    const hidden = (i: number) => (answers[i]!.element as HTMLElement).style.display === 'none'
    expect([hidden(0), hidden(1)]).toEqual([true, true])

    await wrapper.findAll('.bfq__head')[1]!.trigger('click')
    expect([hidden(0), hidden(1)]).toEqual([true, false])
    expect(wrapper.findAll('.bfq__head')[1]!.attributes('aria-expanded')).toBe('true')
  })
})

vi.mock('#imports', () => ({}))
