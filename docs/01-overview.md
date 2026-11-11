# 01 — Product Overview

## 1.1 Product identity

**Working name:** Universal Knowledge Workspace (UKW)  
**Product type:** Browser extension + cross-device PWA  
**Category:** Web annotation, research management, and personal knowledge workspace

### Product statement
A user can collect, annotate, organize, connect, and revisit information from supported webpages and documents in one continuous workspace.

### Core promise
- Save the exact passage that matters.
- Attach personal meaning through notes and tags.
- Connect related ideas visually.
- Return to the original source later.
- Continue on another device without losing context.

## 1.2 Problem statement

Research and online learning are fragmented. Users often read in one tab, write notes in another, draw diagrams in another tool, and later struggle to find the original source. Browser changes and dynamic AI conversation interfaces can also make saved references difficult to restore.

UKW reduces this fragmentation by placing annotation and organization tools beside the source content.

## 1.3 Product pillars

| Pillar | User outcome | Main modules |
|---|---|---|
| Capture | Preserve useful information | Highlight, notes, bookmarks, quick capture |
| Organize | Find information later | Library, tags, collections, projects, search |
| Connect | Understand relationships | Graph, mind map, evidence map, source links |
| Continue | Work across devices | PWA, sync, offline queue, backup |

## 1.4 Target users

### Student
Needs lecture notes, article highlights, PDF annotations, exam collections, and revision bookmarks.

### Independent researcher
Needs literature collections, evidence matrices, source-linked claims, citations, and research graphs.

### Knowledge worker
Needs to save decisions, documentation, meeting references, web research, and follow-up tasks.

### Technical learner
Needs to annotate code examples, documentation, API references, and technical discussions.

## 1.5 Jobs to be done

- When I find a useful passage, I want to highlight it immediately without leaving the page.
- When I highlight something, I want to attach a note and return to that passage later.
- When two sources discuss the same idea, I want to connect them in a graph.
- When I open the same supported source later, I want my annotations to be restored.
- When I switch devices, I want the same library and graph to be available.
- When I work offline, I want edits saved locally and synchronized later.

## 1.6 Experience principles

1. **Source-first:** Keep the original page visible.
2. **Low friction:** Common actions should take one or two interactions.
3. **Local-first:** Save locally before attempting cloud synchronization.
4. **Recoverable:** Deletion, edits, and sync conflicts should not silently destroy data.
5. **Traceable:** Every source-derived note or graph node can point back to its source.
6. **Progressive complexity:** Basic actions stay simple; advanced controls remain discoverable.
7. **Honest compatibility:** Unsupported pages must be identified clearly.

## 1.7 Product boundaries

UKW is not:
- A replacement for the original website or AI platform.
- A universal overlay over every mobile application.
- A guaranteed archival copy of every webpage.
- An AI research assistant in this release.
- A collaborative multi-user whiteboard in the initial release.

## 1.8 Success measures

Track product quality without collecting unnecessary personal content:
- Time from text selection to saved highlight.
- Percentage of annotations restored successfully on revisit.
- Local save success rate.
- Sync success and conflict rate.
- Search time to find a saved note.
- Crash-free sessions.
- PWA offline task completion.
- Number of user actions required for common workflows.

## 1.9 MVP definition

The first usable release is complete when a user can:
1. Highlight text on supported pages.
2. Add and edit a note attached to a highlight.
3. Reopen the page and restore the annotation.
4. Browse the page's annotations in a contextual sidebar.
5. Save data locally and export a backup.
6. Open the same data in a basic PWA library.

Graph editing, cloud sync, and advanced PDF workflows follow after the annotation foundation is stable.
