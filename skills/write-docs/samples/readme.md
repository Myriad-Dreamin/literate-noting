# Project Name

One paragraph that says what the project is, what problem it solves, and the
runtime shape. Avoid a feature list in the first sentence.

## Features

- User-visible capability.
- Storage or integration behavior that changes how the project is used.
- Important offline, local, or deployment mode.

## Requirements

- Runtime version.
- Package manager version.
- External services, if any.

## Development

```sh
package-manager install
package-manager dev
```

Open the local URL printed by the dev server.

## Project Layout

- `src/client`: frontend application.
- `src/server`: backend API.
- `src/shared`: shared types or contracts.

## Configuration

Document only config keys that exist in code. Include defaults, file locations,
and override order when relevant.

## Verification

```sh
package-manager typecheck
package-manager build
```
