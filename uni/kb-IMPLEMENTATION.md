# 🤖 KB Assistant - Работещ Първи Вариант

## ✅ Какво е готово

### Файлове
1. **`kb-matcher.js`** - Интелигентен matcher с keyword matching и fuzzy search
2. **`kb-assistant.js`** - Главна логика на асистента
3. **`kb-ui.js`** - Потребителски интерфейс (FAB бутон + чат)
4. **`kb-assistant.css`** - Модерни стилове с анимации
5. **`index.html`** - Интегриран с KB Assistant

### Функционалности

#### 🔍 Търсене
- Keyword matching с scoring система
- Fuzzy search (Levenshtein distance)
- Търсене в settings, UI елементи и general въпроси
- Поддръжка на български и английски

#### 💬 Чат Интерфейс
- FAB бутон (долен десен ъгъл) 💬
- Модерен чат прозорец
- Greeting съобщение при отваряне
- Предложения за често задавани въпроси
- Loading анимация
- Smooth animations

#### 📝 Отговори
- Форматирани отговори според типа (setting/ui/general)
- "Покажи ми къде" бутон за guide
- Локация на настройката
- Свързани теми
- Допълнителни резултати

#### 🎨 Дизайн
- Gradient colors (purple/blue)
- Smooth animations
- Responsive design
- Dark mode support
- Highlight ефект за UI елементи

## 🚀 Как да тествате

### ⚠️ ВАЖНО: Стартиране на локален сървър

Поради CORS ограничения, трябва да стартирате локален HTTP сървър:

#### Метод 1: Използвайте batch скрипта (Препоръчително)
```bash
# Двоен клик на файла или от командния ред:
start-server.bat
```

#### Метод 2: Ръчно стартиране
```bash
# В папката uni/ изпълнете:
python -m http.server 8000
```

След това отворете браузъра на:
- **Тестова страница**: http://localhost:8000/kb-test.html
- **Главно приложение**: http://localhost:8000/index.html

### 1. Отворете тестовата страница
```
http://localhost:8000/kb-test.html
```

### 2. Кликнете на FAB бутона (💬)
- Долен десен ъгъл
- Ще се отвори чат прозорец

### 3. Тествайте въпроси

#### Примерни въпроси на български:
- "как да покажа датите"
- "линкове"
- "как да търся"
- "офлайн"
- "календар"
- "google drive"

#### Примерни въпроси на английски:
- "how to show dates"
- "links"
- "how to search"
- "offline"
- "calendar"
- "google drive"

### 4. Тествайте "Покажи ми къде"
- Задайте въпрос за настройка
- Кликнете "Покажи ми къде →"
- Трябва да се highlight-не съответния елемент

### 5. Тествайте предложенията
- При отваряне на чата се показват 5 предложения
- Кликнете на предложение за да го попитате

## 🔧 Настройки

### Езикова поддръжка
Асистентът автоматично използва текущия език от `localStorage.getItem('language')`.

За да смените езика:
```javascript
localStorage.setItem('language', 'bg'); // или 'en'
```

### Брой резултати
По подразбиране се показват топ 3 резултата. За да промените:

В `kb-assistant.js`, метод `ask()`:
```javascript
const results = this.matcher.search(query, 5); // Промени 3 на 5
```

### Брой предложения
По подразбиране се показват 5 предложения. За да промените:

В `kb-ui.js`, метод `showSuggestions()`:
```javascript
const suggestions = window.kbAssistant.getSuggestions(10); // Промени 5 на 10
```

## 🐛 Debugging

### Отваряне на Console
`F12` → Console

### Проверка дали е инициализиран
```javascript
console.log(window.kbAssistant.isInitialized); // трябва да е true
```

### Тестване на търсене
```javascript
const results = await window.kbAssistant.ask("как да покажа датите");
console.log(results);
```

### Проверка на KB данните
```javascript
console.log(window.kbAssistant.kbData);
```

### Проверка на matcher
```javascript
const results = window.kbAssistant.matcher.search("линкове", 5);
console.log(results);
```

## 📊 Scoring Система

### Точки за съвпадения:
- **+10** - Точно съвпадение в keywords
- **+5** - Частично съвпадение в keywords
- **+3** - Съвпадение във въпроса
- **+2** - Съвпадение в label
- **+2** - Бонус за general въпроси
- **+1** - Fuzzy match

### Пример:
Въпрос: "как да покажа датите"

Резултат за `show-datemod-checkbox`:
- "дата" в keywords → +10
- "покажа" в keywords → +5
- "как" във въпроса → +3
- **Общо: 18 точки**

## 🎯 Следващи стъпки (Фаза 2)

### 1. Интеграция с Guide система
- [ ] Интеграция с `msmguide.js`
- [ ] Показване на Mr. StickyMan
- [ ] Анимирани guided tours

### 2. Подобрения на UI
- [ ] История на разговора
- [ ] Експорт на разговора
- [ ] Shortcuts (напр. `/search`)

### 3. Разширени функции
- [ ] Context awareness
- [ ] Multi-step workflows
- [ ] Analytics (кои въпроси са най-чести)

### 4. Оптимизация
- [ ] Кеширане на резултати
- [ ] Lazy loading на KB данни
- [ ] Минификация на файлове

## 📝 Известни проблеми

### 1. Guide интеграция
- Засега `showGuide()` само highlight-ва елемента
- Трябва интеграция с `msmguide.js` за пълен guided tour

### 2. Settings modal
- Ако Settings е затворен, `showGuide()` не може да highlight-не елемент
- Решение: Автоматично отваряне на Settings преди highlight

### 3. Език
- Трябва синхронизация с `i18n.js` за автоматична смяна на езика

## 💡 Съвети

### За по-добри резултати:
1. Попълнете повече keywords в `kb-template.json`
2. Използвайте синоними и вариации
3. Добавете често задавани въпроси в `general` секцията

### За по-бързо зареждане:
1. Минифицирайте `kb-template.json`
2. Използвайте CDN за файловете
3. Кеширайте KB данните

---

**Готово за тестване!** 🎉

Отворете `index.html` и кликнете на 💬 бутона в долния десен ъгъл.
