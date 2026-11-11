# 17 — Coding Standards

## 17.1 General principles

- Prefer clarity over cleverness.
- Keep functions focused.
- Avoid giant components.
- Separate UI, domain logic, persistence, and platform adapters.
- Do not duplicate business rules across extension and PWA.
- Handle errors explicitly.
- Avoid hidden global state.

## 17.2 TypeScript

- Enable strict mode.
- Avoid `any`; use `unknown` at untrusted boundaries.
- Define discriminated unions for entity types.
- Validate imported and network data at runtime.
- Prefer immutable update patterns.
- Use explicit return types for public service functions.

## 17.3 Naming

- Components: `PascalCase`.
- Functions and variables: `camelCase`.
- Constants: `UPPER_SNAKE_CASE` when truly constant.
- Files: consistent `kebab-case` or feature-based convention.
- Database columns: `snake_case`.
- Feature IDs: stable uppercase prefix plus number.

## 17.4 Module boundaries

Suggested layers:
- `domain/`: types, pure business rules.
- `repositories/`: database reads and writes.
- `services/`: use cases and orchestration.
- `adapters/`: browser/platform integration.
- `components/`: reusable UI.
- `features/`: user-facing feature modules.
- `workers/`: background processing and sync.

React components should not contain complex anchor matching, SQL logic, or sync conflict algorithms.

## 17.5 Error handling

- Use typed error codes.
- Show actionable user messages.
- Preserve unsaved drafts.
- Log technical diagnostics without private page text by default.
- Never swallow errors silently.
- Avoid exposing stack traces to normal users.

## 17.6 UI standards

- Use design tokens.
- Use semantic HTML.
- Provide accessible labels.
- Avoid clickable non-button elements.
- Keep focus visible.
- Support keyboard operation.
- Avoid colour-only status indicators.
- Respect reduced motion.
- Use loading, empty, and error states.

## 17.7 Database standards

- Use transactions for related writes.
- Index fields used in frequent filters.
- Validate before persistence.
- Keep migrations versioned.
- Use soft delete where recovery is required.
- Use stable foreign keys and ownership rules.
- Do not rely on client-provided ownership identity.

## 17.8 Extension standards

- Manifest V3 only.
- Minimal permissions.
- Isolate extension UI.
- Avoid destructive DOM mutation.
- Clean up event listeners and observers.
- Validate runtime messages.
- Keep platform selectors inside adapters.
- Test on a clean browser profile.

## 17.9 Git workflow

Branch examples:
- `main`
- `develop`
- `feature/annotation-toolbar`
- `fix/anchor-restoration`

Commit style:
- `feat: add highlight colour picker`
- `fix: preserve selection before opening sidebar`
- `test: cover duplicate quote anchors`
- `docs: update sync conflict strategy`

## 17.10 Code review checklist

- Does the change match a feature ID?
- Is the data model updated?
- Are migrations required?
- Are tests added?
- Are loading/error states handled?
- Does offline mode still work?
- Does it preserve source context?
- Does it introduce a permission or security risk?
- Is documentation updated?
