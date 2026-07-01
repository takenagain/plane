# Spec: Secure Cookie Storage

## Status

| Field        | Value             |
| ------------ | ----------------- |
| Priority     | P1                |
| Phase        | 2.2               |
| Requirements | NFR security, FR3 |

## Problem

`SaveSecurely()` and `LoadSecurely()` in `internal/cookie/cookie.go` read/write plain JSON under the user config directory. Session tokens are exposed to other processes and backups.

## Goals

Store authentication cookies using OS-native secret storage:

| Platform | API                        |
| -------- | -------------------------- |
| Windows  | DPAPI / Credential Manager |
| macOS    | Keychain                   |
| Linux    | libsecret (Secret Service) |

## Design

### Interface

```go
type SecureStore interface {
    Save(key string, data []byte) error
    Load(key string) ([]byte, error)
    Delete(key string) error
}

const cookieStoreKey = "plane-desktop-session"
```

Platform files:

- `internal/cookie/store_windows.go`
- `internal/cookie/store_darwin.go`
- `internal/cookie/store_linux.go`

### Migration

1. On first run with secure store, import legacy JSON file if present
2. Delete plaintext file after successful migration
3. Log migration (no cookie values)

### Dependencies

Evaluate:

- `github.com/zalando/go-keyring` (cross-platform wrapper)
- Or platform-specific packages per Wails conventions

Pin exact versions in `go.mod`.

## Acceptance Criteria

- [ ] Cookies not written to plaintext JSON in steady state
- [ ] Load/save works on Linux (primary dev target)
- [ ] Legacy file migration path documented
- [ ] Unit tests with mock `SecureStore`

## References

- `design.md` §5 Security
- `internal/cookie/cookie.go` TODOs at lines 94, 117
