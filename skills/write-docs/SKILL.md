---
name: write-docs
description: Create, revise, and review project documentation for software repositories. Use when Codex is asked to write or improve README files, setup guides, API docs, architecture notes, changelogs, user guides, contributor docs, or release documentation, especially when documentation should be grounded in the actual codebase and examples.
---

# Write Docs

## Workflow

1. Read the repository before writing. Inspect the package files, scripts,
   source layout, config files, existing docs, and tests that prove the
   documented behavior.
2. Identify the audience and task. A quick-start README, a maintainer
   architecture note, and an API reference need different density and ordering.
3. Prefer verified facts over assumptions. If a command, endpoint, environment
   variable, or storage path is documented, confirm it from source or by running
   the relevant command when safe.
4. Write for execution. Put commands, file paths, required versions, and
   expected outputs where a user needs them. Avoid marketing copy unless the
   requested artifact is explicitly promotional.
5. Keep docs maintainable. Use short sections, stable headings, and examples
   that can be updated without rewriting the whole document.
6. Validate links, commands, and generated examples. If something cannot be
   verified, state the assumption in the final response instead of presenting it
   as proven.

## Document Types

- README: lead with what the project is, how to run it, the core workflows, and
  where important code lives.
- Setup guide: list prerequisites, install steps, environment variables, local
  services, validation commands, and common failure modes.
- API docs: document routes, methods, request bodies, response shapes, errors,
  persistence behavior, and a minimal curl example when useful.
- Architecture note: describe responsibilities, boundaries, data flow, storage,
  operational constraints, and tradeoffs that affect future changes.
- Changelog or release notes: group by user-visible change, migration impact,
  bug fixes, and verification.
- Contributor docs: document branch workflow, checks, coding conventions, and
  how to run focused tests.

## Style Rules

- Be concrete and concise. Use plain language and repository-specific nouns.
- Put the most common path first, then alternatives.
- Use code fences for commands and examples.
- Use inline code for file paths, script names, environment variables, routes,
  config keys, and UI labels.
- Avoid documenting features that do not exist.
- Do not invent support policies, security guarantees, or deployment steps.
- Keep generated docs ASCII unless the target file already uses another
  language or encoding.

## Samples

Use the files in `samples/` as structure references:

- `samples/readme.md`: project README structure.
- `samples/api-reference.md`: compact API documentation.
- `samples/architecture-note.md`: maintainer-facing design note.
- `samples/changelog-entry.md`: release-note style change summary.
