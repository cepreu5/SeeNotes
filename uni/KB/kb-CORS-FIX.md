# 🔧 CORS Fix - Инструкции

## ❌ Проблем

При отваряне на `index.html` или `kb-test.html` директно от файловата система (`file://`), получавате CORS грешка:

```
Access to fetch at 'file:///C:/Projects/SeeNotes/uni/kb-template.json' 
from origin 'null' has been blocked by CORS policy
```

## ✅ Решение

Трябва да стартирате локален HTTP сървър.

---

## 🚀 Метод 1: Batch скрипт (Най-лесен)

### Windows:
```bash
# Двоен клик на файла:
start-server.bat

# Или от командния ред:
cd C:\Projects\SeeNotes\uni
start-server.bat
```

След това отворете браузъра на:
- **Тестова страница**: http://localhost:8000/kb-test.html
- **Главно приложение**: http://localhost:8000/index.html

---

## 🚀 Метод 2: Python HTTP сървър (Ръчно)

### Стъпка 1: Отворете терминал
```bash
cd C:\Projects\SeeNotes\uni
```

### Стъпка 2: Стартирайте сървъра
```bash
python -m http.server 8000
```

### Стъпка 3: Отворете браузъра
- **Тестова страница**: http://localhost:8000/kb-test.html
- **Главно приложение**: http://localhost:8000/index.html

### Стъпка 4: Спиране на сървъра
Натиснете `Ctrl+C` в терминала

---

## 🚀 Метод 3: Node.js HTTP сървър (Алтернатива)

Ако имате Node.js инсталиран:

### Инсталиране на http-server (еднократно):
```bash
npm install -g http-server
```

### Стартиране:
```bash
cd C:\Projects\SeeNotes\uni
http-server -p 8000
```

### Отваряне в браузъра:
- http://localhost:8000/kb-test.html
- http://localhost:8000/index.html

---

## 🚀 Метод 4: VS Code Live Server (Ако използвате VS Code)

### Стъпка 1: Инсталирайте разширението
1. Отворете VS Code
2. Отидете в Extensions (Ctrl+Shift+X)
3. Търсете "Live Server"
4. Инсталирайте "Live Server" от Ritwick Dey

### Стъпка 2: Стартирайте сървъра
1. Отворете `kb-test.html` или `index.html` във VS Code
2. Кликнете с десен бутон на файла
3. Изберете "Open with Live Server"

Или просто кликнете на "Go Live" в долния десен ъгъл на VS Code.

---

## 📝 Защо е нужен HTTP сървър?

Браузърите имат CORS (Cross-Origin Resource Sharing) политика, която блокира `fetch()` заявки към локални файлове чрез `file://` протокол от съображения за сигурност.

Когато използвате HTTP сървър (`http://localhost:8000`), файловете се обслужват чрез HTTP протокол, което позволява `fetch()` заявките да работят нормално.

---

## 🐛 Troubleshooting

### Порт 8000 е зает?
Използвайте друг порт:
```bash
python -m http.server 8080
```
След това отворете: http://localhost:8080/kb-test.html

### Python не е намерен?
1. Инсталирайте Python от https://www.python.org/downloads/
2. По време на инсталацията маркирайте "Add Python to PATH"
3. Рестартирайте терминала

### Все още не работи?
1. Проверете дали сървърът е стартиран (трябва да видите "Serving HTTP on...")
2. Проверете дали URL-ът е правилен (http://localhost:8000, НЕ file://)
3. Проверете Console (F12) за други грешки

---

## ✅ Готово!

След като стартирате сървъра, KB Assistant ще работи без CORS грешки! 🎉

**Следваща стъпка**: Отворете http://localhost:8000/kb-test.html и тествайте асистента.
