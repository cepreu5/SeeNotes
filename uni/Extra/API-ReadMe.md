# SeeNotes — API за търсене в бележките (Google Apps Script)

Самостоятелен **read-only** HTTP endpoint за търсене в бележките на SeeNotes.
Приложението (`uni/`) е чисто статичен PWA без сървър, затова търсенето е
отделен Apps Script проект, който работи от името на собственика на папката и
чете директно от Google Drive.

Скриптът **никога** не създава, променя, трие или мести файлове. Манифестът
иска само `drive.readonly`, така че Google сам не позволява запис.

## Файлове

| Файл | Какво е |
| --- | --- |
| `notes-api.gs` | Кодът: `doGet(e)` |
| `appsscript.json` | Манифест: Web App, изпълнява се от собственика, достъп „Anyone“, часова зона Europe/Sofia |
| `test/local-test.js` | Локален тест (чист Node, без `npm install`) |
| `test/fixtures/` | Примерни `note.txt` / `board.txt` файлове, вкл. един повреден |

## Инсталиране

1. Отвори <https://script.google.com> → **Нов проект** (със същия Google акаунт,
   в чийто Drive е папката `CX-Notes`).
2. **Project Settings** → отметни *Show "appsscript.json" manifest file in editor*.
3. Замени съдържанието на `appsscript.json` с файла от тук.
4. Замени `Code.gs` със съдържанието на `notes-api.gs` (името на файла в
   проекта няма значение).
5. **Project Settings → Script Properties → Add script property**:
   - `API_TOKEN` = дълъг случаен ключ, например от
     `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
     Без `API_TOKEN` всяка заявка връща `unauthorized`.
   - (по избор) `FOLDER_ID` = ID на конкретната папка, ако имаш няколко папки
     с име `CX-Notes`. Без него се търси `CX-Notes`, а ако не съществува —
     старата `multinotes_data` (както прави и приложението).
6. **Deploy → New deployment → Web app**. Execute as: *Me*, Who has access:
   *Anyone*. При първото пускане Google ще поиска разрешение за четене на Drive.
7. Копирай URL-а на Web App-а (`https://script.google.com/macros/s/.../exec`).

При промяна на кода: **Deploy → Manage deployments → Edit → New version**,
иначе URL-ът продължава да сервира старата версия.

## Използване

```
GET https://script.google.com/macros/s/<ID>/exec?key=<API_TOKEN>&q=договор
```

`curl` трябва да следва пренасочването: `curl -L "<URL>?key=...&q=..."`.

| Параметър | Описание |
| --- | --- |
| `key` | Ключът от `API_TOKEN` (задължителен) |
| `q` | Текст за търсене. Няколко думи, разделени с интервал = **всички** трябва да се срещат. Без значение от главни/малки букви (и за кирилица). Без `q` — само метаданни (health check) |
| `board` | Заглавие на борд (напр. `Работа`) или неговото id / gdid |
| `from`, `to` | `YYYY-MM-DD`, филтър по датата на бележката (`date`, в часова зона Europe/Sofia) |
| `limit` | Брой резултати, по подразбиране 20, максимум 100 |

### Отговор при търсене

```json
{
  "ok": true,
  "folder": "CX-Notes",
  "query": "договор",
  "count": 1,
  "truncated": false,
  "scanned": { "noteFiles": 812, "notes": 812, "boards": 7, "corrupt": 0, "capped": false },
  "results": [
    {
      "id": 102,
      "gdid": "1AbC...",
      "title": "Договор за наем",
      "board": "Лични",
      "boardId": "1XyZ...",
      "date": "2026-01-05",
      "modified": "2026-01-05T12:00:00+02:00",
      "matchIn": "title",
      "snippet": "…около 200 знака около първото съвпадение…",
      "text": "пълният текст на бележката",
      "driveUrl": "https://drive.google.com/file/d/1AbC.../view"
    }
  ]
}
```

- `gdid` е Drive ID на самия `note.txt` файл на бележката, `id` — вътрешното id.
- `title` се извежда от текста, както в приложението: частта преди `|`, иначе
  първият непразен ред (бележките нямат отделно поле за заглавие).
- `board` е заглавието на борда от `board.txt`, `boardId` — суровата стойност `boardid`.
- `matchIn`: `title`, `text` или `both`.
- Сортиране: първо съвпаденията в заглавието, после по `datemod` (най-новите отгоре).
- `truncated: true` — има още резултати над `limit` или сканирането е спряло на
  тавана (`scanned.capped: true`, 2000 файла / 45 секунди).
- `scanned.corrupt` — брой непарсваеми `note.txt` файлове (прескачат се).

Без `q` отговорът е `{"ok":true,"folder":"...","scanned":{...},"count":0,"truncated":false,"results":[]}`.

### Какво НЕ се връща

- Бележки в Кошчето (`status: 1`).
- Скритата част на скрити бележки (`pass: true`): търси се и се връща само
  видимото превю преди `|`.
- Никакви други полета от обекта на бележката (`pass`, `uiState`, …) и никога ключът.

### Грешки

| Ситуация | Тяло |
| --- | --- |
| Липсващ или грешен ключ | `{"ok":false,"error":"unauthorized"}` |
| Невалидна дата във `from`/`to` | `{"ok":false,"error":"bad_date"}` |
| Папката не е намерена | `{"ok":false,"error":"folder_not_found"}` |
| Неочаквана грешка | `{"ok":false,"error":"internal_error"}` |

## Важни ограничения на Apps Script

- **HTTP статусът винаги е 200.** Web App не може да връща 401/500 — логиката
  избира статус (401, 400, 404, 500), но навън той е само в тялото. Проверявай
  полето `ok`.
- **Хедърът `X-API-Key` на практика не стига до скрипта** — Apps Script не
  подава хедърите на заявката в `doGet(e)`. Кодът го проверява, ако някога
  бъде подаден, но в реална употреба ползвай параметъра `key`.
- Ключът в URL може да остане в история/логове на клиента — пази URL-а като
  парола и сменяй `API_TOKEN` при съмнение (промяната важи веднага, без нов deploy).
- Всяка заявка чете всички `note.txt` файлове наново; при стотици бележки
  отговорът отнема няколко секунди.

## Локален тест

```
node apps-script/test/local-test.js
```

Тестът подменя `DriveApp`, `PropertiesService`, `ContentService` и `Utilities`
с фалшиви обекти, които четат от `test/fixtures/`, и извиква `doGet`.
Фалшивият Drive хвърля грешка при всеки метод за запис. Печата PASS/FAIL за
всеки тест и излиза с код ≠ 0 при провал.