# Attach Image from Gallery to Note

This plan outlines the implementation of a new feature: adding an attachment button (paperclip) to the note modal to allow selecting multiple images/files from the gallery and attaching them to the currently open note.

## Open Questions

- Should the attachment button only allow images (`image/*`), or also videos and audio (`video/*, audio/*`)?
- Currently, I plan to reuse the robust background-upload logic we just fixed for `share_target`. This means the user can select images, they will upload in the background, and will automatically link to the note once the note is saved. Is this acceptable?

## Proposed Changes

### `index.html`

- **[MODIFY] `index.html`**
  - Add a hidden file input: `<input type="file" id="modal-attach-image-input" accept="image/*,video/*,audio/*" multiple style="display: none;">`
  - Add a paperclip button (`<button id="attach-image-modal-btn" title="Прикачи файл">...</button>`) to the modal toolbar (next to the other action buttons).

### `main.js`

- **[MODIFY] `main.js`**
  - In `initNoteEditUI()`, add an event listener to the paperclip button that triggers the hidden file input's `click()`.
  - Add a `change` event listener to the hidden file input to process the selected files.
  - Implement a `processSelectedFiles(files, targetNoteId)` function that mimics the robust upload logic from `handleShareTarget`:
    - Upload each file to Google Drive (`uploadBlobToGDrive`).
    - Use `waitForNoteGdid` (with a 30-minute timeout) to wait for the note to receive its GDID.
    - Create a `mediaEntry` for each uploaded file and save it to `media.txt`.
    - Append to `mediaData` and refresh the note UI (`refreshNoteUI`).
    - Display toasts indicating upload progress and success.

## Verification Plan

### Manual Verification
- Open an existing note, click the paperclip button, select multiple images from the gallery, and verify they are uploaded and displayed in the note.
- Create a new note, write some text, attach an image, and click "Save". Verify the image is linked properly.
- Verify that there are no permission issues on Android (the native file picker handles permissions automatically).
