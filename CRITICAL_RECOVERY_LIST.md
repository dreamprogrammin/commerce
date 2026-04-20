# 🚨 КРИТИЧНЫЕ КАТЕГОРИИ И БРЕНДЫ ДЛЯ ВОССТАНОВЛЕНИЯ

## 📦 КАТЕГОРИИ (по приоритету)

### Корневые категории:
- [ ] `/catalog/boys` - Мальчикам
- [ ] `/catalog/girls` - Девочкам
- [ ] `/catalog/kiddy` - Малышам
- [ ] `/catalog/babies` - Младенцам
- [ ] `/catalog/constructors-root` - Конструкторы (корневая)
- [ ] `/catalog/constructors` - Конструкторы (старая?)
- [ ] `/catalog/holyday` - Праздники
- [ ] `/catalog/creativity` - Творчество
- [ ] `/catalog/games` - Игры
- [ ] `/catalog/play` - Игры (альтернативная)
- [ ] `/catalog/myagkie-igrushki` - Мягкие игрушки
- [ ] `/catalog/accessories` - Аксессуары

### Подкатегории: Мальчикам (boys)
- [ ] `/catalog/boys/mashinki` - Машинки
- [ ] `/catalog/boys/mashinki/radioupravlyaemye-mashinki` - Радиоуправляемые машинки
- [ ] `/catalog/boys/mashinki/avtotreki` - Автотреки
- [ ] `/catalog/boys/rolevye-i-syuzhetnye-nabory` - Ролевые и сюжетные наборы
- [ ] `/catalog/boys/igrushechnoe-oruzhie` - Игрушечное оружие
- [ ] `/catalog/boys/igrushechnoe-oruzhie/igrushechnye-avtomaty` - Игрушечные автоматы

### Подкатегории: Девочкам (girls)
- [ ] `/catalog/girls/kukly` - Куклы
- [ ] `/catalog/girls/kukly/kukly-aksessuary` - Куклы аксессуары
- [ ] `/catalog/girls/kukly/interaktivnye-kukly` - Интерактивные куклы
- [ ] `/catalog/girls/igrovye-nabory-dlya-devochek` - Игровые наборы для девочек

### Подкатегории: Малышам (kiddy)
- [ ] `/catalog/kiddy/bizibordy` - Бизиборды
- [ ] `/catalog/kiddy/bizibordy/bizikub` - Бизикубы
- [ ] `/catalog/kiddy/bizibordy/bizidomiki` - Бизидомики
- [ ] `/catalog/kiddy/bizibordy/bizidoski` - Бизидоски
- [ ] `/catalog/kiddy/tolokar` - Толокар
- [ ] `/catalog/kiddy/katalki` - Каталки
- [ ] `/catalog/kiddy/kovriki` - Коврики
- [ ] `/catalog/kiddy/kovriki/kovriki-pazly` - Коврики-пазлы

### Подкатегории: Младенцам (babies)
- [ ] `/catalog/babies/plyushevye-igrushki` - Плюшевые игрушки

### Подкатегории: Конструкторы (constructors-root)
- [ ] `/catalog/constructors-root/konstruktory-malchikam` - Конструкторы мальчикам
- [ ] `/catalog/constructors-root/konstruktory-devochkam` - Конструкторы девочкам

### Подкатегории: Игры (play)
- [ ] `/catalog/play/board-games` - Настольные игры

### Подкатегории: Аксессуары (accessories)
- [ ] `/catalog/accessories/batteries` - Батарейки

### Старые категории (нужны редиректы):
- [ ] `/catalog/konstruktory-malchikam` → `/catalog/constructors-root/konstruktory-malchikam`
- [ ] `/catalog/konstruktory-devochkam` → `/catalog/constructors-root/konstruktory-devochkam`
- [ ] `/catalog/kovriki-pazly` → `/catalog/kiddy/kovriki/kovriki-pazly`
- [ ] `/catalog/metallicheskie-mashinki` → `/catalog/boys/mashinki/metallicheskie-mashinki`
- [ ] `/catalog/katalki` → `/catalog/kiddy/katalki`

### Специальные страницы:
- [ ] `/catalog/all` - Все товары
- [ ] `/catalog/new` - Новинки

---

## 🏷️ БРЕНДЫ (по приоритету)

### Топ-бренды:
- [ ] `/brand/lego` - LEGO
- [ ] `/brand/mattel` - Mattel
- [ ] `/brand/lol-surprise` - LOL Surprise
- [ ] `/brand/bowa` - BOWA
- [ ] `/brand/sluban` - Sluban
- [ ] `/brand/cada` - CADA

### Средние бренды:
- [ ] `/brand/mg-toys` - MG Toys
- [ ] `/brand/play-smart` - Play Smart
- [ ] `/brand/feelo` - Feelo
- [ ] `/brand/gudi` - Gudi
- [ ] `/brand/shantou-yisheng` - Shantou Yisheng
- [ ] `/brand/fivestar-toys` - FiveStar Toys
- [ ] `/brand/my-litle-home` - My Little Home
- [ ] `/brand/mokatoys` - MokaToys
- [ ] `/brand/eva-puzzle` - Eva Puzzle
- [ ] `/brand/huanger` - Huanger
- [ ] `/brand/koala-diary` - Koala Diary
- [ ] `/brand/mermaze` - Mermaze

### Линейки брендов:
- [ ] `/brand/lego/lego-marvel` - LEGO Marvel
- [ ] `/brand/lego/city` - LEGO City
- [ ] `/brand/mattel/hot-wheels` - Hot Wheels

---

## 🔧 ДЕЙСТВИЯ

### 1. Создать категории в админке (СЕГОДНЯ!)
Используй ТОЧНЫЕ slug из списка выше. Порядок:
1. Корневые категории
2. Подкатегории первого уровня
3. Подкатегории второго уровня

### 2. Создать бренды в админке (СЕГОДНЯ!)
Используй ТОЧНЫЕ slug из списка выше.

### 3. Добавить 301 редиректы для старых URL
Открой `nuxt.config.ts` и добавь:

```typescript
nitro: {
  routeRules: {
    // ... существующие редиректы ...
    
    // Старые категории → новые
    '/catalog/konstruktory-malchikam': {
      redirect: { to: '/catalog/constructors-root/konstruktory-malchikam', statusCode: 301 }
    },
    '/catalog/konstruktory-devochkam': {
      redirect: { to: '/catalog/constructors-root/konstruktory-devochkam', statusCode: 301 }
    },
    '/catalog/kovriki-pazly': {
      redirect: { to: '/catalog/kiddy/kovriki/kovriki-pazly', statusCode: 301 }
    },
    '/catalog/metallicheskie-mashinki': {
      redirect: { to: '/catalog/boys/mashinki/metallicheskie-mashinki', statusCode: 301 }
    },
    '/catalog/katalki': {
      redirect: { to: '/catalog/kiddy/katalki', statusCode: 301 }
    },
  }
}
```

---

## ✅ ПРОВЕРКА

После создания категорий и брендов проверь:

```bash
# Проверка категорий
curl -I https://uhti.kz/catalog/boys
curl -I https://uhti.kz/catalog/girls
curl -I https://uhti.kz/catalog/kiddy

# Проверка брендов
curl -I https://uhti.kz/brand/lego
curl -I https://uhti.kz/brand/mattel
curl -I https://uhti.kz/brand/bowa

# Проверка редиректов
curl -I https://uhti.kz/catalog/konstruktory-malchikam
# Должно быть: 301 → /catalog/constructors-root/konstruktory-malchikam
```

Все должны вернуть `HTTP/2 200` (или `HTTP/2 301` для редиректов).

---

## 📊 СТАТИСТИКА

- **Корневых категорий:** 12
- **Подкатегорий:** 25+
- **Брендов:** 15+
- **Линеек брендов:** 3
- **Редиректов:** 5+

**Приоритет:** 🔥 КРИТИЧНО - восстановить СЕГОДНЯ!
