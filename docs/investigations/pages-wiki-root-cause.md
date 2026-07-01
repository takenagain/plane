# Pages / Wiki detail view crash — root cause

**Symptoms (production):**

- React error **#185** — maximum update depth exceeded (`forceUpdate` in `componentDidMount`, bundled in `use-editor-flagging` chunk)
- React error **#418** — hydration HTML mismatch (secondary; DOM torn down by rapid remount loop)
- **WebSocket closed before established** — Yjs/Hocuspocus provider destroyed before connect finished

**Affected surfaces:** Project Pages and Workspace Wiki detail views (`PageEditorBody` → `CollaborativeDocumentEditorWithRef`).

## Root cause

TipTap 3's `useEditor` recreates the editor instance whenever its **extensions dependency array identity** changes. On every React re-render, two code paths were producing **new extension/handler object references**, so the editor was destroyed and recreated continuously:

1. **`useEditorNavigation`** (`packages/editor/src/core/hooks/use-editor-navigation.ts`)  
   `createTitleNavigationExtension()` / `createMainNavigationExtension()` ran on **every hook invocation**, returning new `Extension.create()` instances. Those were included in `useCollaborativeEditor`'s `useMemo` deps, so `editorExtensions` changed every render → TipTap tore down and rebuilt the editor → NodeViews/`ReactRenderer` mounted again → `forceUpdate` in `componentDidMount` → React #185 loop.

2. **`PageEditorBody`** (`apps/web/core/components/pages/editor/editor-body.tsx`)  
   `mentionHandler` and `aiHandler` were inline object literals passed to `CollaborativeDocumentEditorWithRef`. Each parent re-render (MobX observer, collaboration state updates, etc.) produced new references → `useEditor`'s `resolvedExtensions` `useMemo` invalidated → same destroy/recreate loop.

The WebSocket error is a **downstream effect** when React #185 is present: `useYjsSetup`'s provider is tied to the editor mount lifecycle via `CollaborationProvider`; rapid unmount/remount closes the socket before `onConnect` fires.

### Collaboration WebSocket 404 (edit/save blocked after #185 fix)

Even after the React loop is fixed, collaboration can stay broken if `plane-live` returns **404** on the WebSocket upgrade path the client uses.

| Request                                                       | Result                      |
| ------------------------------------------------------------- | --------------------------- |
| `GET /live/collaboration?documentType=…` (Upgrade)            | **101** Switching Protocols |
| `GET /live/collaboration/.websocket?documentType=…` (Upgrade) | **404** (before fix)        |

**Cause:** `PageEditorBody` builds `…/live/collaboration` with query params (`documentType`, `workspaceSlug`, `projectId`). The Hocuspocus client upgrade hits `/live/collaboration/.websocket`, but `CollaborationController` only registered `@WebSocket("/")` → `/live/collaboration/`. REST page APIs succeed; real-time sync/collab does not.

**Fix:** Register a second WebSocket route at `/.websocket` on `CollaborationController` that delegates to the same Hocuspocus `handleConnection` handler.

## Related hardening (already present)

- **`useEditorFlagging`** (`apps/web/ce|extended/hooks/use-editor-flagging.ts`) returns a module-level `EDITOR_FLAGGING_CONFIG` constant so `disabledExtensions` / `flaggedExtensions` array identities stay stable. (Same pattern applied in the time-tracking PR for issue/sticky editors; Pages/Wiki body was not updated at that time.)
- **`editor-body.tsx`** `hasMounted` gate defers the collaborative editor until client mount, avoiding SSR/client markup divergence for the editor subtree.
- **`use-editor.ts`** uses `immediatelyRender: false` and guards for TipTap 3 destroyed-editor access.

## Fix

1. Memoize navigation extensions in `useEditorNavigation` with `useMemo`.
2. Memoize `mentionHandler` and `aiHandler` in `PageEditorBody` (matching `apps/web/core/components/editor/document/editor.tsx`).
3. Register `/.websocket` on `apps/live/src/controllers/collaboration.controller.ts` so both `/live/collaboration` and `/live/collaboration/.websocket` upgrade successfully.

## How to verify

1. Start dev stack: `pnpm dev` (web on :3000, live on :3100) **or** rebuild Docker live: `docker compose build live && docker compose up -d live`.
2. Confirm WebSocket upgrade on the `.websocket` path:
   ```bash
   curl -i -N \
     -H "Connection: Upgrade" -H "Upgrade: websocket" \
     -H "Sec-WebSocket-Version: 13" -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" \
     "http://localhost:8081/live/collaboration/.websocket?documentType=workspace_page&workspaceSlug=test-ws"
   ```
   Expect `HTTP/1.1 101 Switching Protocols` (not 404).
3. Open a **Project Page** detail URL: `/{workspaceSlug}/projects/{projectId}/pages/{pageId}`.
4. Open a **Wiki** detail URL: `/{workspaceSlug}/wiki/{pageId}`.
5. Confirm:
   - Page loads without "Something went wrong" / white screen.
   - No React #185 / #418 in the browser console.
   - Collaboration status progresses (syncing → synced); no repeated "WebSocket closed before established".
   - Title and body editors are editable; changes persist after refresh.
6. Optional: `pnpm check:types --filter=@plane/editor --filter=web --filter=live` passes.
