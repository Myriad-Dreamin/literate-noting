# Literate Noting

Literate Noting is a local-first visual Markdown note editor. It uses React and
Lexical for editing, an optional Hono backend for local filesystem access, and
renders ABC notation as playable music inside the document.

中文文档: [README.zh.md](README.zh.md).

## Features

- Visual Markdown editing with explicit Markdown export on save.
- Inline ABC notation: `{C D E F | G A B c}` renders as notes in the text.
- Block ABC notation with fenced ```` ```abc note ```` blocks.
- Playable notation rendered with `abcjs`.
- Piano tone selection in the settings panel.
- Local Markdown folder selection with path autocomplete.
- Create, delete, reload, and save Markdown files.
- XDG-compliant settings stored at `~/.config/literate-noting/settings.json`
  by default.
- Browser storage fallback through localStorage and IndexedDB.
- GitHub Pages deploys the frontend only; without the backend, the app falls
  back to browser storage.

## Screenshot

![Literate Noting screenshot](docs/screenshot.png)

## Installation

Requirements:

- Node.js 22 or newer.
- pnpm 10.

```sh
pnpm install
pnpm dev
```

Open:

```text
http://127.0.0.1:5173
```

`pnpm dev` starts two local services:

- Vite frontend: `http://127.0.0.1:5173`
- Hono backend: `http://127.0.0.1:8787`

## Usage

- Enter a path in the folder field, choose an autocomplete result, and click the
  folder button to open it.
- Enter a title in the new-file field and click the new-file button to create a
  Markdown document.
- Select a document, edit it, and press `Ctrl+S` to save.
- Open settings to change the piano tone.
- Use the delete button to remove the current document.

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

GitHub Pages builds and deploys only the frontend. Without the Hono backend,
local folder selection and filesystem writes are unavailable, but the app still
persists data through localStorage and IndexedDB.

For repository-scoped Pages deployments, set `BASE_PATH`:

```sh
BASE_PATH=/literate-noting/ pnpm --filter literate-noting build:client
```

## Verification

```sh
pnpm typecheck
pnpm build
```
