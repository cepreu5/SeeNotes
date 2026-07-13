# Markdown table preview notes

The app renders Markdown tables in note preview/read mode as HTML tables.

Normal table:

```md
| Field | Type | Description |
| - | - | - |
| availability | string | Availability |
| propertytype | string | Property type |
```

Renders as a bordered HTML table with a header row.

Borderless table:

If the first header cell contains only `%%`, for example the definition starts with `|%%|`, the renderer treats that header row as a formatting directive. It skips the header row and renders the data rows as an HTML table without visible borders.

```md
|%%| Name | Value |
| - | - | - |
| A | 10 | Ready |
| Beta | 200 | Pending |
```

Renders as aligned columns without visible table borders.

Editing mode keeps the original Markdown text unchanged.
Because this table starts with a pipe, the note title/body pipe-splitting logic must not treat the first `|` as a note title separator.
The `%%` directive header is also not used as the note card title.
Table text is skipped by the edit-time Markdown marker conversion, so a custom clear marker such as `%%` must not remove the borderless directive.
