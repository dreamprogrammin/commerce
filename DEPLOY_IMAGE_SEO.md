# 🚀 Инструкция для деплоя Image SEO

## Шаг 1: Добавь переменную окружения в Vercel

1. Открой [Vercel Dashboard](https://vercel.com)
2. Выбери свой проект
3. Settings → Environment Variables
4. Добавь новую переменную:

```
Name: SUPABASE_SERVICE_ROLE_KEY
Value: <твой service role key>
```

**Где найти service role key:**
1. Открой [Supabase Dashboard](https://supabase.com/dashboard)
2. Выбери свой проект
3. Settings → API
4. Скопируй `service_role` key (⚠️ это секретный ключ!)

---

## Шаг 2: Деплой

```bash
git push origin master
```

Vercel автоматически задеплоит изменения.

---

## Шаг 3: Запусти генерацию alt-текстов

### Вариант 1: Через админку (рекомендуется)

1. Открой: `https://your-site.com/admin/image-seo`
2. Нажми: **"Сгенерировать Alt-тексты"**
3. Дождись завершения (увидишь статистику)

### Вариант 2: Через API

```bash
curl -X POST https://your-site.com/api/generate-alt-texts
```

---

## Что произойдет:

✅ Все изображения товаров получат SEO-оптимизированные alt-тексты:
- `LEGO Конструктор Железный Человек Marvel купить в Казахстане`
- `Barbie Кукла Принцесса Disney вид сбоку`
- `Hot Wheels Трек Мертвая петля детальное фото`

✅ Изображения начнут индексироваться в Google Images

✅ Через 2-3 недели появятся первые переходы из поиска по картинкам

---

## Проверка

После генерации проверь любую страницу товара:
1. Открой DevTools (F12)
2. Elements → найди `<img>` теги
3. Проверь атрибут `alt`

Должно быть:
```html
<img alt="LEGO Конструктор Железный Человек Marvel купить в Казахстане">
```

---

## Готово! 🎉

Теперь твои изображения работают на тебя в Google Images!

**Документация:** `docs/IMAGE_SEO_COMPLETE.md`
