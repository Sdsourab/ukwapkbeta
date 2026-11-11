# Universal Knowledge Workspace
### Product Documentation & Engineering Blueprint

> **A cross-device workspace for web annotation, research organization, and visual knowledge building.**
>
> Version: 1.0 · Documentation status: Initial product baseline · AI features: Out of scope

## What this project is

Universal Knowledge Workspace (UKW) combines a browser extension and a mobile-friendly Progressive Web App (PWA). It lets a person capture information from supported websites, annotate it, organize it into research collections, and connect ideas visually—without constantly switching tabs or applications.

The product is designed around one principle:

**Keep the source visible while the user works with their knowledge.**

The desktop extension provides an in-page floating toolbar and collapsible contextual sidebar. The PWA provides a synchronized library, reader, notes workspace, and graph editor on mobile and desktop.

## Documentation map

| File | Purpose |
|---|---|
| `01-overview.md` | Product vision, scope, personas, principles |
| `02-requirements.md` | Functional and non-functional requirements |
| `03-architecture.md` | System architecture, modules, data flow |
| `04-ui-ux.md` | Interface system, layouts, themes, interactions |
| `05-database.md` | Data model, entities, indexes, relationships |
| `06-features.md` | Complete feature catalogue and acceptance criteria |
| `07-business-logic.md` | Annotation anchoring, restoration, sync, graph logic |
| `08-api.md` | Internal messaging and cloud API contracts |
| `09-roadmap.md` | Phased implementation plan |
| `10-task-tracker.md` | Work breakdown, status, dependencies |
| `11-testing.md` | Test strategy and test cases |
| `12-security.md` | Threat model, privacy, access control |
| `13-deployment.md` | Local development, build, hosting, release |
| `14-changelog.md` | Product and documentation change history |
| `15-known-issues.md` | Risks, limitations, mitigations |
| `16-ai-context.md` | Stable project context for coding assistants (no AI product feature) |
| `17-coding-standards.md` | Code quality, naming, architecture rules |
| `18-decision-log.md` | Architecture Decision Records |

## Product scope

### Included
- Browser-based text and document annotation
- Multi-colour highlights, underline, strike-through, notes and bookmarks
- Source-aware annotation restoration
- Contextual in-page toolbar and sidebar
- Knowledge graph, mind map, flowchart and diagram canvas
- Research projects, papers, references and evidence matrices
- Universal library and search
- PDF reading and annotation where technically supported
- Tasks and reading progress
- Desktop browser extension
- Mobile PWA with shared account and synchronized data
- Local-first storage, offline editing, backup and export
- Themes, accessibility, keyboard shortcuts and customization

### Explicitly excluded from this release
- AI summaries
- AI chat assistant
- AI-generated notes or graph nodes
- Paid or third-party AI APIs
- Automatic semantic reasoning powered by an LLM

The architecture may later expose optional extension points, but no AI service is required for the product to work.

## Recommended stack

- Extension: Chrome Manifest V3
- Application: React + TypeScript
- Styling: CSS variables / design tokens; optional utility CSS
- Local database: IndexedDB through Dexie
- Graph canvas: React Flow / XYFlow
- PDF rendering: PDF.js
- Cloud: Supabase Auth + PostgreSQL + Row Level Security
- Offline: Service Worker + IndexedDB
- Hosting: static hosting with a free tier, subject to provider limits
- Version control: Git

## How to use these documents

1. Read `01-overview.md`, `02-requirements.md`, and `03-architecture.md` first.
2. Treat `06-features.md` as the feature catalogue and `09-roadmap.md` as the implementation order.
3. Before coding a module, read its data model, business logic, API contract, security requirements, and tests.
4. Update `10-task-tracker.md`, `14-changelog.md`, and `18-decision-log.md` when work changes.
5. Never mark a feature complete until its acceptance criteria and tests pass.

## Important engineering truth

A single developer can build this incrementally, but a production-quality implementation of every listed module is a substantial project. Build a reliable annotation core before expanding into graph editing, PDF tools, cloud synchronization, and advanced research management.
