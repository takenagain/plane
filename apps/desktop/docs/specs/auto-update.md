# Spec: Auto-Update Mechanism

## Status

| Field        | Value                   |
| ------------ | ----------------------- |
| Priority     | P3                      |
| Phase        | 6.3                     |
| Requirements | Future / design.md §9.3 |

## Problem

No update checking or installer delivery pipeline exists for desktop builds.

## Goals

1. Check GitHub Releases (or Plane CDN) for newer version on startup
2. Download signed artifact for current OS/arch
3. Prompt user to restart and apply update

## Design

### Version Source

- Embed build version via `-ldflags` at compile time
- Compare semver against release API

### Wails Updater

Evaluate Wails built-in updater module vs custom:

- Verify signature / checksum before apply
- Support delta or full binary per platform

### Release Pipeline (out of app scope)

- GitHub Actions matrix: windows, macos, linux
- Attach MSI/DMG/AppImage/deb artifacts to releases
- Code signing certificates required for macOS/Windows (human decision)

## Acceptance Criteria

- [ ] App detects newer release version
- [ ] User can defer or install update
- [ ] Update fails safely on signature mismatch

## Blockers

- Release signing credentials
- Hosting for update manifests

## References

- `design.md` §9.3
- `tasks.md` Phase 6.3
