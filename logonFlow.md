Viewed c:\dev\Projects\SeeNotes\uni\logonFlow.md:2-101
Ran command: `git status`

Ето актуалната графика и подробно описание на обновения **Logon Flow**:

```mermaid
flowchart TD
    Start([Стартиране на приложението]) --> CheckOffline{Има ли интернет?}

    %% Офлайн режим
    CheckOffline -- Не --> OfflineMode[Офлайн режим: Зареждане от IndexedDB / Кеш]
    OfflineMode --> RenderUI([Готово: Приложението работи офлайн])

    %% Онлайн режим
    CheckOffline -- Да --> CheckStoredToken{Наличен ли е валиден токен в Storage?}
    
    CheckStoredToken -- Да --> StartAppDirect[Директно стартиране: startApp]
    
    CheckStoredToken -- Изтекъл + RememberMe --> SilentRefresh[Тих refresh на токена]
    SilentRefresh -- Успешен --> StartAppDirect
    SilentRefresh -- Неуспешен --> ShowLoginPage[Показване на Логин Екран]
    
    CheckStoredToken -- Не --> ShowLoginPage

    %% Логин действие
    ShowLoginPage --> UserClicksAuth["Потребителят натиска 'Вход с Google' (handleAuthClick)"]
    UserClicksAuth --> OAuthBase["Google OAuth с базови права (SCOPES_BASE)<br><i>drive.file, drive.appdata, userinfo.email</i>"]
    
    OAuthBase --> AuthSuccess["authCallback: Запазване на токен и скриване на Логин екрана"]
    AuthSuccess --> InitMainLogic["startApp -> mainLogic: Показване на Loader екран"]

    %% Проверка на състоянието на акаунта
    InitMainLogic --> CheckLocalCache{Има ли локален кеш в localStorage?}
    
    CheckLocalCache -- Да (folderSetupDone) --> LoadNotes["Зареждане на бележки от CX-Notes"]
    
    CheckLocalCache -- Не --> CompleteSetup["completeInitialFolderSetup()"]
    
    CompleteSetup --> CheckAppData{"1. Има ли app-config.json в AppDataFolder?"}
    
    CheckAppData -- Да --> RestoreFromAppData["Възстановяване на конфигурацията<br><i>(БЕЗ модал)</i>"]
    RestoreFromAppData --> LoadNotes
    
    CheckAppData -- Не --> CheckCXNotes{"2. Съществува ли вече папка CX-Notes в Drive?"}
    
    CheckCXNotes -- Да --> ActivateExistingCX["Активиране на намерената CX-Notes и запис в AppData<br><i>(БЕЗ модал)</i>"]
    ActivateExistingCX --> LoadNotes
    
    CheckCXNotes -- Не (Истински 1-ви старт) --> ShowModal["Показване на модал за избор (showInitialDataFolderModal)"]

    %% Избор в модала
    ShowModal --> ChoiceBranch{Какво избра потребителят?}

    %% Опция 1: Миграция
    ChoiceBranch -- "Мигриране от multinotes_data" --> RequestReadOnly["Искане на допълнителен scope drive.readonly"]
    RequestReadOnly --> FetchAndMigrate["1. Извличане на данни от multinotes_data<br>2. Създаване на CX-Notes и подпапки<br>3. Паралелно прехвърляне на бележки и медия<br>4. Запис на app-config.json"]
    FetchAndMigrate --> LoadNotes

    %% Опция 2: Празна папка
    ChoiceBranch -- "Създаване на празна CX-Notes" --> CreateEmpty["1. Създаване на CX-Notes в Drive<br>2. Създаване на начален борд Main<br>3. Запис на app-config.json"]
    CreateEmpty --> LoadNotes

    %% Финал
    LoadNotes --> RenderUIOnline([Скриване на Loader-а: Приложението е заредено])
```

---

### Основни подобрения в новия flow:

1. **Без фалшиви модали за съществуващи потребители:**
   * Дори при изчистен кеш, ново устройство или инкогнито прозорец, след Google вход първо се проверяват `AppDataFolder` и наличната папка `CX-Notes`. Ако потребителят вече има настроени данни, приложението ги зарежда веднага **без да пита нищо**.
2. **Първо вход, после избор:**
   * Модалът се показва **само и единствено** ако акаунтът никога досега не е използван с CX-Notes (няма папка `CX-Notes` и няма `app-config.json`).
3. **Инкрементални права (Incremental Consent):**
   * Всички потребители се логват първоначално само с безопасни базови права (`drive.file`). Допълнителното право за четене (`drive.readonly`) се изисква само при изричен избор за мигриране от `multinotes_data`.
4. **Правилен визуален тайминг:**
   * Логин екранът се скрива незабавно след Google входа, а целият процес по проверка/миграция се визуализира в лоудъра на приложението.