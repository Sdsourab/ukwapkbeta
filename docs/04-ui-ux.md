# 04 — UI/UX Design System

## 4.1 Design direction

**Visual direction:** Modern research instrument — calm, precise, readable, and professional.

The interface should feel like a premium reading and research tool, not a crowded admin dashboard.

### UX priorities
1. Source content remains the main focus.
2. Annotation controls appear only when relevant.
3. Sidebar is contextual and collapsible.
4. Common actions do not require navigation away from the page.
5. Graph canvas gets space when the user explicitly enters graph mode.
6. Mobile layouts prioritize reading, capture, and editing.

## 4.2 Desktop workspace layout

```text
┌──────────────────────────────────────────────────────────────────┐
│ Browser page                                                     │
│                                                                  │
│  Original source content             Contextual sidebar          │
│  ┌─────────────────────────────┐     ┌─────────────────────────┐  │
│  │ Article / conversation      │     │ Overview                │  │
│  │                             │     │ Highlights              │  │
│  │ Selected passage            │     │ Notes                   │  │
│  │ [highlighted]               │     │ Graph                   │  │
│  │                             │     │ Sources                 │  │
│  │                             │     │ Tasks                   │  │
│  └─────────────────────────────┘     └─────────────────────────┘  │
│          Floating selection toolbar                              │
└──────────────────────────────────────────────────────────────────┘
```

### Layout rules
- Sidebar width: responsive; user can resize it.
- Sidebar should not cover selected text if an alternative position exists.
- On narrow screens, sidebar may become a drawer.
- Preserve scroll position and selection context.
- Remember open/closed state per user preference.
- Avoid forcing a new tab for notes or graph quick actions.

## 4.3 Navigation model

Primary navigation:
- Overview
- Library
- Research
- Graphs
- Tasks
- Settings

Contextual navigation inside the page:
- Highlights
- Notes
- Bookmarks
- Graph
- Sources
- History

Do not duplicate the full application navigation inside the small extension panel.

## 4.4 Floating toolbar

Actions:
- Highlight
- Colour picker
- Underline
- Strike-through
- Note
- Bookmark
- Create node
- Connect to node
- Copy
- More

Rules:
- Position relative to selection bounds.
- Reposition when clipped by viewport.
- Close on Escape.
- Do not steal focus before capturing the selected text.
- Support keyboard access.
- Provide tooltips and accessible labels.
- Avoid obscuring the selection.

## 4.5 Design tokens

Use CSS custom properties rather than hard-coded colours.

```css
:root {
  color-scheme: light;
  --bg: #f6f8fc;
  --surface: #ffffff;
  --surface-2: #eef2f8;
  --text: #172033;
  --text-muted: #647089;
  --border: #dce3ee;
  --accent: #5267e8;
  --focus: #8ba0ff;
  --success: #17845b;
  --warning: #a96512;
  --danger: #c43c4b;
  --radius-sm: 8px;
  --radius-md: 12px;
  --radius-lg: 18px;
  --shadow-panel: 0 12px 36px rgba(18, 32, 58, .12);
}

[data-theme="dark"] {
  color-scheme: dark;
  --bg: #0c111b;
  --surface: #141c29;
  --surface-2: #1c2737;
  --text: #edf2fb;
  --text-muted: #a2aec2;
  --border: #2b394d;
  --accent: #91a1ff;
  --focus: #b4c0ff;
}
```

## 4.6 Theme modes

Required theme choices:
- Light
- Dark
- System
- Dim / low-glare
- High contrast

Optional later:
- Warm paper
- Sepia reading
- Midnight blue
- Forest
- Custom accent colour

Theme requirements:
- Theme applies consistently to extension and PWA.
- Highlight colours remain distinguishable in every theme.
- User can preview before applying.
- Persist preference locally and synchronize it.
- Respect system preference when System is selected.

## 4.7 Highlight palette

Provide a small default palette and an advanced custom picker.

Suggested semantic palette:
- Yellow: general important passage
- Green: useful fact or supporting evidence
- Blue: definition or concept
- Pink: question or critical point
- Orange: action or follow-up
- Purple: personal insight

Do not force meanings on users; allow colour labels to be renamed.

## 4.8 Typography and readability

- Use a readable sans-serif UI font.
- Keep line lengths comfortable.
- Use clear heading hierarchy.
- Avoid tiny metadata text.
- Use consistent spacing.
- Support browser zoom.
- Make note editor comfortable for long text.
- Provide reduced-motion option.
- Use visible focus states.

## 4.9 Mobile PWA layout

Bottom navigation:
- Home
- Library
- Graph
- Research
- Profile

Mobile interaction:
- Touch-friendly targets.
- Bottom sheets for quick actions.
- Full-screen graph editor.
- Pinch-to-zoom and drag canvas.
- Sticky save/sync status.
- Avoid hover-only interactions.
- Reader and notes should be reachable with minimal navigation.

## 4.10 Empty, loading, and error states

Every major screen needs:
- First-use empty state with one clear next action.
- Skeleton/loading state.
- Offline state.
- Sync pending state.
- Sync failed state with retry.
- Permission or unsupported-page explanation.
- No-results search state.
- Recoverable error message.

## 4.11 Accessibility checklist

- Keyboard-only operation for core actions.
- Correct semantic buttons and inputs.
- Accessible names for icon-only buttons.
- Sufficient contrast.
- Focus order matches visual order.
- Do not use colour alone to communicate meaning.
- Respect reduced-motion preferences.
- Screen-reader announcements for save/sync status.
