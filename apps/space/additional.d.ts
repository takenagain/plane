// additional.d.ts
/// <reference types="vite/client" />
/// <reference types="next-images" />

// `@bprogress/core/css` is a side-effect-only stylesheet export (it resolves to
// dist/index.css) that ships no type declarations. Declare the bare specifier so
// `tsc --noEmit` can resolve the side-effect import in AppProgressBar.tsx
// (vite/client's `*.css` glob only matches specifiers ending in `.css`).
declare module "@bprogress/core/css";
