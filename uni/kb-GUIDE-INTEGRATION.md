# 🎭 KB Generator v2.0 - Guide Integration

## Какво е Ново?

KB Generator сега автоматично генерира **guide данни** за всяка настройка и UI елемент, които позволяват интеграция с **Mr. StickyMan** (визуалния герой-асистент).

## Структура на Guide Данните

Всяка настройка и UI елемент сега включва `guide` обект:

```json
{
  "id": "scaleSlider",
  "type": "range",
  "category": "display",
  "label": {...},
  "keywords": {...},
  "question": {...},
  "answer": {...},
  
  "guide": {
    "image": "msm/right-up.png",    // Изображение на героя
    "height": 150,                   // Височина на изображението
    "target": "#scaleSlider",        // CSS selector на елемента
    "x": -88,                        // X offset от target
    "y": 1,                          // Y offset от target
    "bx": 199,                       // Balloon X offset
    "by": 166,                       // Balloon Y offset
    "bWidth": 275,                   // Balloon width
    "bHeight": 118,                  // Balloon height
    "stopAfter": true,               // Спира след тази стъпка
    "action": "highlight",           // Действие (highlight, demo, etc.)
    "context": "display"             // Контекст (display, boards, etc.)
  }
}
```

## Default Templates

Генераторът използва различни templates според типа на елемента:

### Checkbox / Select / Number / Radio
```javascript
{
  image: 'msm/left-up.png',
  height: 150,
  x: -50,
  y: 10,
  bx: -200,
  by: 80,
  bWidth: 250,
  bHeight: 100,
  stopAfter: true,
  action: 'highlight'
}
```

### Range (Slider)
```javascript
{
  image: 'msm/right-up.png',
  height: 150,
  x: -88,
  y: 1,
  bx: 199,
  by: 166,
  bWidth: 275,
  bHeight: 118,
  stopAfter: true,
  action: 'highlight'
}
```

### UI Buttons
```javascript
{
  image: 'msm/left-up.png',
  height: 200,
  x: 3,
  y: 16,
  bx: -250,
  by: 96,
  bWidth: 215,
  bHeight: 91,
  stopAfter: true,
  action: 'highlight'
}
```

### UI Input Fields
```javascript
{
  image: 'msm/expl.png',
  height: 150,
  x: 25,
  y: 321,
  bx: 80,
  by: -14,
  bWidth: 241,
  bHeight: 124,
  stopAfter: true,
  action: 'highlight'
}
```

## Как Работи?

1. **Генериране**: Скриптът анализира всеки елемент и избира подходящ template
2. **Персонализация**: Добавя `target` selector и `context` според категорията
3. **Автоматизация**: Всички настройки получават guide данни без ръчна работа

## Ръчно Фино Настройване

След генериране можеш да редактираш guide данните за специални случаи:

```json
{
  "id": "scaleSlider",
  "guide": {
    "image": "msm/right-up.png",
    "height": 150,
    "target": "#scaleSlider",
    "x": -88,                      // ← Фино настроени координати
    "y": 1,
    "bx": 199,
    "by": 166,
    "bWidth": 275,
    "bHeight": 118,
    "stopAfter": false,            // ← Продължава към следваща стъпка
    "relatedSteps": [4, 5],        // ← Показва стъпки 4 и 5 от tour-а
    "action": "demo",              // ← Специално действие
    "context": "settings"
  }
}
```

## Използване

### 1. Генериране на Template

```bash
# Отвори index.html в браузър
# Отвори Developer Console (F12)
# Копирай и изпълни kb-generator.js
```

### 2. Запазване

```bash
# Резултатът се копира автоматично в clipboard
# Запази като kb-template.json
```

### 3. Попълване

```bash
# Попълни keywords, questions и answers
# Ако е нужно, фино настрой guide координатите
```

### 4. Финализиране

```bash
# Запази като kb-data.json
# Готово за използване с KB Assistant!
```

## Предимства

✅ **Автоматизация** - Всички guide данни се генерират автоматично  
✅ **Консистентност** - Еднакви templates за еднакви типове елементи  
✅ **Гъвкавост** - Лесно фино настройване след генериране  
✅ **Интеграция** - Готово за използване с Mr. StickyMan  
✅ **Разширяемост** - Лесно добавяне на нови templates  

## Следващи Стъпки

След генериране на kb-template.json:

1. **Попълни съдържанието** - keywords, questions, answers
2. **Тествай позиционирането** - отвори приложението и провери guide данните
3. **Фино настрой** - промени координати където е нужно
4. **Запази като kb-data.json** - готово за production!

## Пример

Преди (v1.0):
```json
{
  "id": "scaleSlider",
  "keywords": {...},
  "answer": {...}
}
```

След (v2.0):
```json
{
  "id": "scaleSlider",
  "keywords": {...},
  "answer": {...},
  "guide": {
    "image": "msm/right-up.png",
    "target": "#scaleSlider",
    "x": -88,
    "y": 1,
    "bx": 199,
    "by": 166,
    "bWidth": 275,
    "bHeight": 118,
    "stopAfter": true,
    "action": "highlight",
    "context": "display"
  }
}
```

---

**Версия**: 2.0  
**Дата**: 2025-12-04  
**Автор**: KB Generator Team
