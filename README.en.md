# Literate Noting

Literate Noting is a local-first Markdown editor built with React, Lexical, and
Hono. It loads Markdown documents from a backend when one is available, falls
back to browser storage when it is not, and renders ABC notation as playable
music directly inside the editor.

## Features

- Visual Markdown editing with Lexical.
- Inline ABC notation with `{C D E F | G A B c}`.
- Block ABC notation with fenced ```` ```abc note ```` blocks.
- Playable notation rendered with `abcjs`.
- Piano tone settings stored in browser storage and synced to the XDG config
  file.
- Local folder selection through the Hono backend, including path
  autocomplete.
- Create, save, reload, and delete Markdown files.
- Browser-only mode for GitHub Pages or static hosting.

## Requirements

- Node.js 22 or newer.
- pnpm 10.

## Development

```sh
pnpm install
pnpm dev
```

Open `http://127.0.0.1:5173`.

The dev command builds the Hono server, starts the backend on
`http://127.0.0.1:8787`, and starts Vite on `http://127.0.0.1:5173`.

## Project Layout

- `packages/literate-noting/src/client`: React app, Lexical editor, providers,
  settings, and ABC rendering.
- `packages/literate-noting/src/server`: Hono API and static file server.
- `packages/literate-noting/src/shared`: types shared by the client.
- `packages/literate-noting/documents`: default Markdown folder used by the
  backend.
- `skills/write-docs`: Codex skill for writing project documentation.

## Storage Model

The frontend writes settings and document records to both `localStorage` and
IndexedDB. This makes the app usable without the backend, including from GitHub
Pages.

When the backend is available:

- Settings are synced to the XDG config file:
  `~/.config/literate-noting/settings.json`.
- If `XDG_CONFIG_HOME` is set to an absolute path, settings are written to
  `$XDG_CONFIG_HOME/literate-noting/settings.json`.
- `LITERATE_NOTING_CONFIG_DIR` can explicitly override the config directory.
- The selected Markdown folder is stored as `documentsRoot` in the settings
  file.
- `Ctrl+S` saves Markdown to browser storage and to the selected local folder.

Typing drafts are cached as Lexical editor state. Markdown export happens only
on explicit save.

## Backend API

- `GET /api/health`: health check.
- `GET /api/settings`: read settings.
- `PUT /api/settings`: save `{ "settings": ... }`.
- `GET /api/workspace`: read the current Markdown folder.
- `PUT /api/workspace`: open `{ "path": "/path/to/folder" }`.
- `GET /api/folders/suggest?query=/path`: list folder autocomplete results.
- `GET /api/documents`: list Markdown documents in the current folder.
- `POST /api/documents`: create a Markdown document.
- `GET /api/documents/:id`: read one Markdown document.
- `PUT /api/documents/:id`: save `{ "markdown": "..." }`.
- `DELETE /api/documents/:id`: delete one Markdown document.

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

## Static Hosting

GitHub Pages deploys only the Vite frontend. Without the Hono backend, folder
selection and filesystem writes are unavailable, but the app continues to work
with browser storage.

For repository-scoped Pages deployments, set `BASE_PATH` during the Vite build:

```sh
BASE_PATH=/your-repo/ pnpm --filter literate-noting build:client
```

## Verification

```sh
pnpm typecheck
pnpm build
```
