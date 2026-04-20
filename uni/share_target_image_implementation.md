# Share Target: Image Sharing Implementation

## Overview
Added support for sharing images to the PWA via the Web Share Target API. When a user shares an image from another app, CX Notes receives it, creates a new note, uploads the image to Google Drive, and creates a `media.txt` attachment entry linking them.

## Architecture Flow

```mermaid
sequenceDiagram
    participant User as Other App
    participant SW as Service Worker
    participant App as main.js
    participant GD as Google Drive

    User->>SW: POST /index.html (multipart/form-data)
    SW->>SW: Extract image from FormData
    SW->>SW: Store image in 'share-target-image' cache
    SW->>App: Redirect GET /index.html?shared_image=1&shared_text=...
    App->>App: Detect shared_image=1 param
    App->>SW: Read image from cache
    App->>App: Open note modal with edit mode
    Note over App: User saves the note...
    App->>App: Wait for note gdid (polling)
    App->>GD: Upload image to Images/ subfolder
    App->>GD: Create media.txt with attachment metadata
    App->>GD: Update media.txt with its own gdid
    App->>App: Update local mediaData + IndexedDB
```

## Files Changed

### 1. `manifest.webmanifest`
- Changed `method` from `GET` to `POST`
- Added `enctype: "multipart/form-data"`
- Added `files` array accepting `image/*`

### 2. `sw.js`
- Added POST handler in the `fetch` event listener
- Extracts `FormData` from the POST request
- Stores the shared image in a dedicated `share-target-image` cache
- Redirects to GET with text params + `shared_image=1` flag
- Protected `share-target-image` cache from deletion during SW activation

### 3. `main.js`
- **`uploadBlobToGDrive()`** — New function for uploading binary blobs to GDrive (mirrors `createGDriveFile` pattern with token refresh)
- **`handleShareTarget()`** — Now `async`, handles both text and image shares:
  1. Retrieves image blob from the SW cache
  2. Opens note modal for editing
  3. After user saves note → polls for note's gdid
  4. Uploads image to `Images/` subfolder in GDrive
  5. Creates `media.txt` entry linking image to note
  6. Updates local `mediaData` and IndexedDB

### 4. `i18n-bg.json` / `i18n-en.json`
- Added: `sharedContentReceived`, `uploadingSharedImage`, `sharedImageSaved`

## media.txt Format
```json
{
  "datemod": 1769823393360,
  "description": "",
  "gdid": "<ID of this media.txt file>",
  "id": 139,
  "noteid": "<gdid of parent note.txt>",
  "path": "",
  "pathGD": "<gdid of image file in Images/>",
  "type": 1
}
```

> [!IMPORTANT]
> The image attachment is only created after the user saves the note (to get its gdid). A polling mechanism waits up to 30 seconds for the note to be saved.
