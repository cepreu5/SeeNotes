# Implementation Plan: Early IndexedDB Check, Instant UI Render, and Asynchronous Background Sync

Implement an **Offline-First / Stale-While-Revalidate** startup architecture in `main.js`. If notes exist in IndexedDB and the user is verified as the owner, the application renders the boards and notes immediately on boot with near-zero latency, while all authentication checks, Drive synchronization, and configuration updates happen asynchronously in the background.

---

## User Review Required

> [!IMPORTANT]
> **Instant Boot Behavior:**
> When valid local notes exist for the current user, the login page and blocking loader will be bypassed immediately. The notes will render on screen in milliseconds.
> If the Google OAuth session has expired in the background, a non-intrusive re-auth button/toast will appear in the header instead of blocking the app with a full-screen login wall.

---

## Proposed Changes

### [Core Logic & Startup Sequence]

#### [MODIFY] [main.js](file:///c:/dev/Projects/SeeNotes/uni/main.js)

1. **Early Boot & Ownership Verification:**
   - In the startup self-executing function `(async () => { ... })()`:
     - Check if `NOTES_DB_NAME` exists in IndexedDB.
     - Verify ownership: compare `storedUserEmail` (`await getConfig('userEmail')`) with `currentUserEmail` (`google_login_hint` / `google_auth_email_hint`).
     - If `boardsInDb.length > 0` and owner matches $\rightarrow$ launch `startApp(false)` immediately (**Fast Track**).
     - If no local data or ownership mismatch $\rightarrow$ proceed with standard auth check / login page (**Cold Track**).

2. **Immediate UI Render in Fast Track:**
   - Inside `mainLogic()`:
     - When `hasLocalData && isDbOwner`:
       - Execute `fetchAllDataLocal()` immediately.
       - Execute `renderUI({ boardParseError: false })` immediately.
       - Execute `showAppUI()` to display header and notes container, bypassing any blocking loader.
     - Asynchronously start the background task:
       - Verify/refresh Google OAuth token.
       - If authenticated: sync `folders.json`, `app-config.json`, and run Google Drive delta sync (`runGoogleDriveSync()`).
       - If remote updates are found: update IndexedDB and smoothly refresh UI (`renderUI`).
       - If unauthenticated/token expired: keep local data visible and show a discreet re-auth option.

3. **Cold Track (First Run / Clean State / Account Switch):**
   - Retain the clean first-run flow:
     - User signs in $\rightarrow$ `completeInitialFolderSetup()` checks `AppDataFolder` and `CX-Notes` existence $\rightarrow$ only shows selection modal if brand new $\rightarrow$ loads from Drive into IndexedDB $\rightarrow$ renders UI.

4. **Zero Blank Lines Rule:**
   - Ensure all updated functions have zero blank lines inside their bodies.

---

## Verification Plan

### Automated / Syntax Verification
- Run syntax and lint checks on `main.js` via Node CLI to ensure no syntax errors.

### Manual Verification Flow
1. **Existing User with Local Data (Fast Track):**
   - Reload application with existing IndexedDB $\rightarrow$ verify notes appear immediately without waiting for Google Drive network requests.
   - Verify background sync runs and updates smoothly if changes exist.
2. **Account Switch / Mismatch:**
   - Verify that switching to a different Google account triggers user reset and prevents displaying another user's cached notes.
3. **First-Time User (Cold Track):**
   - Clear cache/IndexedDB $\rightarrow$ verify standard login and initial setup flow.
