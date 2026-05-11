# 🎉 Конфетти при успешном оформлении заказа

## 📦 Установлено

**Библиотека:** `canvas-confetti` v1.9.4  
**Источник:** https://github.com/catdad/canvas-confetti

---

## ✅ Где добавлено

**Файл:** `pages/order/success/[id].vue`

**Когда запускается:**
- При открытии страницы успешного оформления заказа
- Автоматически при монтировании компонента (`onMounted`)

---

## 🎨 Эффект

**Party Confetti** - конфетти летит с двух сторон экрана:
- Слева (10-30% ширины экрана)
- Справа (70-90% ширины экрана)
- Длительность: 3 секунды
- Частота: каждые 250ms
- Z-index: 9999 (поверх всех элементов)

---

## 💻 Код

```typescript
import confetti from 'canvas-confetti'

onMounted(async () => {
  // ... другой код ...

  // 🎉 Запускаем конфетти
  const duration = 3000
  const animationEnd = Date.now() + duration
  const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 9999 }

  function randomInRange(min: number, max: number) {
    return Math.random() * (max - min) + min
  }

  const interval = setInterval(() => {
    const timeLeft = animationEnd - Date.now()

    if (timeLeft <= 0) {
      return clearInterval(interval)
    }

    const particleCount = 50 * (timeLeft / duration)

    // Конфетти слева
    confetti({
      ...defaults,
      particleCount,
      origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 },
    })
    
    // Конфетти справа
    confetti({
      ...defaults,
      particleCount,
      origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 },
    })
  }, 250)
})
```

---

## 🎯 Результат

При успешном оформлении заказа:
1. ✅ Пользователь видит страницу "Спасибо за ваш заказ!"
2. 🎉 Автоматически запускается анимация конфетти
3. 🎊 Конфетти летит с двух сторон в течение 3 секунд
4. ✨ Создаёт праздничную атмосферу

---

## 🔧 Настройка

Если нужно изменить эффект, отредактируй параметры:

```typescript
const duration = 3000        // Длительность (мс)
const startVelocity = 30     // Начальная скорость
const spread = 360           // Угол разброса (360 = во все стороны)
const ticks = 60             // Количество кадров анимации
const particleCount = 50     // Количество частиц
```

---

## 📝 Дата добавления

**11.05.2026** - Добавлен Party Confetti на страницу успешного оформления заказа
