# 🔍 Анализ ошибок Google Search Console

## 📊 Статистика
- **Дата проверки:** 28.04.2026 - 02.05.2026
- **Найдено ошибок:** 11 страниц
- **Последнее сканирование:** 4-6 мая 2026

---

## 🔴 Проблемные URL

### 1. Категории с фильтрами (3 страницы)
```
https://uhti.kz/catalog/girls/kukly/interaktivnye-kukly?brand=cufan
https://uhti.kz/catalog/kiddy/kovriki/kovriki-pazly?brand=eva-puzzle
https://uhti.kz/catalog/boys/mashinki/radioupravlyaemye-mashinki?brand=huangbo-toys
```
**Проблема:** Бренды `cufan`, `eva-puzzle`, `huangbo-toys` не существуют или были удалены
**Решение:** Проверить наличие брендов в БД

### 2. Товары (6 страниц)
```
https://uhti.kz/catalog/products/pistolet-mylnyh-puzyrey-yhc-01-2-butylochki-rastvora-24x14-sm-2-cveta-ot-3-let
https://uhti.kz/catalog/products/pistolet-mylnyh-puzyrey-double-bubble-vortex-bubble-blaster-560a-tysyachi-puzyrey-118-ml-ot-3-let
https://uhti.kz/catalog/products/pistolet-generator-mylnyh-puzyrey-2188-78-s-podsvetkoy-yarkoe-svetovoe-shou-ot-3-let
https://uhti.kz/catalog/products/volshebnaya-palochka-generator-mylnyh-puzyrey-s-krylyami-fei-podsvetka-usb-zaryadka-ot-3-let
https://uhti.kz/catalog/products/konstruktor-sluban-m38-b1020-gruzovik-pikap-na-radioupravlenii-2-4-ggc-397-detaley
```
**Проблема:** Товары не существуют или были удалены
**Решение:** Автоматический 301 редирект уже работает

### 3. Категории (2 страницы)
```
https://uhti.kz/catalog/holyday/mylnye-puzyri
https://uhti.kz/catalog/creativity/muzykalnye-instrumenty
```
**Проблема:** Подкатегории не существуют
**Решение:** Создать категории

---

## ✅ План действий

### Шаг 1: Проверить бренды
```sql
SELECT slug, name FROM brands WHERE slug IN ('cufan', 'eva-puzzle', 'huangbo-toys');
```

### Шаг 2: Добавить недостающие бренды и категории
```sql
-- Бренды
INSERT INTO brands (name, slug) VALUES
('Cufan', 'cufan'),
('Eva Puzzle', 'eva-puzzle'),
('Huangbo Toys', 'huangbo-toys')
ON CONFLICT (slug) DO NOTHING;

-- Категории
INSERT INTO categories (name, slug, href, parent_id, display_order)
SELECT 'Мыльные пузыри', 'mylnye-puzyri', '/catalog/holyday/mylnye-puzyri', id, 1 
FROM categories WHERE slug = 'holyday'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO categories (name, slug, href, parent_id, display_order)
SELECT 'Музыкальные инструменты', 'muzykalnye-instrumenty', '/catalog/creativity/muzykalnye-instrumenty', id, 1 
FROM categories WHERE slug = 'creativity'
ON CONFLICT (slug) DO NOTHING;
```

---

## 📈 Результат

- ✅ 3 страницы с фильтрами заработают
- ✅ 2 категории заработают
- ✅ 6 товаров получат 301 редирект (автоматически)

**Через 1-2 недели:** Ошибки исчезнут из GSC
