# Literate Noting

React + Lexical frontend with a Hono backend, structured like the `work/ts/lilith` project. The app loads Markdown documents from the API, edits them visually in Lexical, and renders playable ABC notation with `abcjs`.

Full English documentation: [README.en.md](README.en.md).

## Run

```sh
pnpm install
pnpm dev
```

Open `http://127.0.0.1:5173`.

## Workspace

- `packages/literate-noting/src/client`: React, Lexical, ABC rendering and playback.
- `packages/literate-noting/src/server`: Hono API and static client hosting.
- `packages/literate-noting/documents`: Markdown documents served by the backend.
- Current document folder is stored in the XDG config file at
  `~/.config/literate-noting/settings.json` unless `XDG_CONFIG_HOME` or
  `LITERATE_NOTING_CONFIG_DIR` overrides it.
- The frontend keeps settings and document records in `localStorage` and
  IndexedDB so it can run without the backend. `Ctrl+S` syncs Markdown to the
  browser stores and, when the backend is available, the selected local folder.

## API

- `GET /api/workspace` returns the current Markdown folder.
- `PUT /api/workspace` opens `{ "path": "/path/to/folder" }`.
- `GET /api/folders/suggest?query=/path` returns folder autocomplete results.
- `GET /api/documents` lists Markdown documents.
- `POST /api/documents` creates a Markdown file from `{ "title": "..." }`.
- `GET /api/documents/:id` returns one document.
- `PUT /api/documents/:id` saves `{ "markdown": "..." }`.
- `DELETE /api/documents/:id` deletes one Markdown file.

## ABC Markdown Syntax

Inline ABC notation:

```md
Inline melody: {C D E F | G A B c}
```

Block ABC notation:

````md
```abc note
X:1
T:Block tune
M:4/4
L:1/8
K:C
CDEF GABc | cBAG FEDC |
```
````
