# 🤖 Knowledge Base Generator - Инструкции

## Какво прави този инструмент?

`kb-generator.js` автоматично анализира съществуващите файлове на приложението и генерира **template** за базата от знания на чат-асистента. Той извлича:

- ✅ **Настройки** (checkboxes, selects, inputs)
- ✅ **UI елементи** (бутони, полета)
- ✅ **Структура за общи въпроси**

## 📋 Стъпка 1: Генериране на Template

### Метод 1: Чрез Browser Console (Препоръчително)

1. Отвори `index.html` в браузър
2. Натисни `F12` за да отвориш Developer Tools
3. Отиди в таба **Console**
4. Копирай целия код от `kb-generator.js` и го постави в конзолата
5. Натисни `Enter`
6. JSON template-ът ще бъде автоматично копиран в clipboard
7. Създай нов файл `kb-template.json` и го запази

### Метод 2: Чрез Script Tag

1. Добави временно в `index.html` (преди затварящия `</body>` таг):
   ```html
   <script src="kb-generator.js"></script>
   ```
2. Отвори `index.html` в браузър
3. Отвори Console (`F12`)
4. Копирай JSON output-а
5. Премахни script tag-а от HTML

## 📝 Стъпка 2: Попълване на Template

След като имаш `kb-template.json`, трябва да попълниш празните полета:

### За всяка настройка (`settings`):

```json
{
  "id": "show-datemod-checkbox",
  "keywords": {
    "bg": ["дата", "време", "модификация", "промяна"],  // ← ПОПЪЛНИ
    "en": ["date", "time", "modification", "change"]     // ← ПОПЪЛНИ
  },
  "question": {
    "bg": "Как да покажа датата на промяна?",            // ← ПОПЪЛНИ
    "en": "How to show modification date?"               // ← ПОПЪЛНИ
  },
  "answer": {
    "bg": "Отиди в Settings и маркирай...",              // ← ПОПЪЛНИ
    "en": "Go to Settings and check..."                  // ← ПОПЪЛНИ
  }
}
```

### За всеки UI елемент (`ui`):

```json
{
  "id": "search-box",
  "keywords": {
    "bg": ["търсене", "намиране", "search"],             // ← ПОПЪЛНИ
    "en": ["search", "find", "lookup"]                   // ← ПОПЪЛНИ
  },
  "description": {
    "bg": "Полето за търсене позволява...",             // ← ПОПЪЛНИ
    "en": "The search field allows..."                   // ← ПОПЪЛНИ
  }
}
```

### За общи въпроси (`general`):

```json
{
  "id": "organize-notes",
  "answer": {
    "bg": "Използвай Boards (дъски) за групиране...",   // ← ПОПЪЛНИ
    "en": "Use Boards to group notes by topics..."      // ← ПОПЪЛНИ
  }
}
```

## 🎯 Стъпка 3: Какво да попълниш където?

### **Keywords** (Ключови думи)
- Как потребителите биха **формулирали въпроса**
- Синоними и вариации
- Примери:
  - За "One-Click Links": `["линк", "едно кликване", "url", "връзка", "отваряне"]`
  - За "Calendar": `["календар", "дати", "месец", "седмица", "напомняния"]`

### **Questions** (Въпроси)
- Типичен въпрос, който потребител би задал
- Примери:
  - `"Как работи настройката X?"`
  - `"Къде мога да намеря Y?"`
  - `"Защо не виждам Z?"`

### **Answers** (Отговори)
- Кратко, ясно обяснение
- Стъпки ако е нужно
- Примери:
  ```
  "Отиди в Settings > Display и маркирай 'Show modification date'. 
   Това ще покаже датата на последна промяна под всяка бележка."
  ```

## 📊 Структура на генерирания JSON

```
kb-template.json
├── metadata (автоматично)
│   ├── generated
│   ├── version
│   └── description
├── settings[] (автоматично извлечени)
│   ├── id
│   ├── type
│   ├── category
│   ├── label (bg/en)
│   ├── keywords (bg/en) ← ПОПЪЛНИ
│   ├── question (bg/en) ← ПОПЪЛНИ
│   └── answer (bg/en)   ← ПОПЪЛНИ
├── ui[] (автоматично извлечени)
│   ├── id
│   ├── type
│   ├── label (bg/en)
│   ├── keywords (bg/en)     ← ПОПЪЛНИ
│   └── description (bg/en)  ← ПОПЪЛНИ
└── general[] (template)
    ├── id
    ├── category
    ├── keywords (bg/en) - вече попълнени
    ├── question (bg/en) - вече попълнени
    └── answer (bg/en)   ← ПОПЪЛНИ
```

## 🔍 Категории на настройките

Генераторът автоматично категоризира настройките:

- **display** - Визуални настройки (шрифт, мащаб, дати)
- **behavior** - Поведение (линкове, сортиране)
- **boards** - Настройки за бордове
- **sorting** - Подреждане на бележки
- **data** - Източници на данни (Google Drive, Database, Local)
- **search** - Търсене
- **calendar** - Календар
- **startup** - Стартови настройки

## ⚠️ Важни бележки

1. **НЕ променяй** автоматично генерираните полета (`id`, `type`, `category`, `label`)
2. **Попълни само** полетата маркирани с `← ПОПЪЛНИ`
3. **Използвай прости изречения** - асистентът ще цитира директно отговорите
4. **Добави примери** където е възможно
5. **Бъди консистентен** в терминологията на BG и EN

## 📝 Пример за добре попълнена настройка

```json
{
  "id": "one-tap-link-checkbox",
  "type": "checkbox",
  "category": "behavior",
  "label": {
    "bg": "Линкове с един клик:",
    "en": "One-click links:"
  },
  "keywords": {
    "bg": ["линк", "едно кликване", "url", "връзка", "отваряне", "ctrl"],
    "en": ["link", "one click", "url", "hyperlink", "open", "ctrl"]
  },
  "question": {
    "bg": "Как работи настройката 'Линкове с един клик'?",
    "en": "How does the 'One-click links' setting work?"
  },
  "answer": {
    "bg": "Когато е активирана, линковете в бележките се отварят директно при кликване. Когато е изключена, линковете са подчертани и се отварят с Ctrl+Click. Намери настройката в Settings > Behavior.",
    "en": "When enabled, links in notes open directly on click. When disabled, links are underlined and open with Ctrl+Click. Find this setting in Settings > Behavior."
  },
  "location": "Settings",
  "defaultValue": false,
  "relatedSettings": ["img-bgrd-checkbox"]
}
```

## 🚀 Следващи стъпки

След като попълниш `kb-template.json`:

1. Прегледай го за грешки
2. Тествай дали JSON-ът е валиден (използвай JSON validator)
3. Запази като `kb-data.json` (финалната версия)
4. Готов си за следващата фаза - имплементация на асистента!

## 💡 Съвети

- **Започни с най-важните настройки** - не е нужно да попълниш всичко наведнъж
- **Тествай keywords** - мисли как ТИ би попитал за дадена настройка
- **Използвай съществуващите текстове** от `i18n.js` за консистентност
- **Добави troubleshooting** - "Ако не виждаш X, провери Y"

---

**Въпроси?** Попитай ме! 🤖
