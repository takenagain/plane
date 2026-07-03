package cookie

import (
	"net/http"
	"os"
	"path/filepath"
	"testing"
)

func TestEncryptedFileStoreRoundTrip(t *testing.T) {
	t.Parallel()

	dir := t.TempDir()
	store := newEncryptedFileStore(dir)
	payload := []byte(`{"cookies":[{"Name":"session-id","Value":"secret"}]}`)

	if err := store.Save(payload); err != nil {
		t.Fatalf("save: %v", err)
	}

	loaded, err := store.Load()
	if err != nil {
		t.Fatalf("load: %v", err)
	}
	if string(loaded) != string(payload) {
		t.Fatalf("unexpected payload: %q", loaded)
	}

	keyPath := filepath.Join(dir, storageKeyFile)
	info, err := os.Stat(keyPath)
	if err != nil {
		t.Fatalf("storage key missing: %v", err)
	}
	if info.Mode().Perm() != 0600 {
		t.Fatalf("storage key should be 0600, got %o", info.Mode().Perm())
	}

	encPath := filepath.Join(dir, encryptedCookieFile)
	encInfo, err := os.Stat(encPath)
	if err != nil {
		t.Fatalf("encrypted file missing: %v", err)
	}
	if encInfo.Mode().Perm() != 0600 {
		t.Fatalf("encrypted file should be 0600, got %o", encInfo.Mode().Perm())
	}
}

func TestManagerMigratesLegacyPlaintext(t *testing.T) {
	t.Parallel()

	dir := t.TempDir()
	legacyPath := filepath.Join(dir, "cookies.json")
	legacyData := []byte(`{
  "cookies": [{"Name":"session-id","Value":"legacy-token","Path":"/"}],
  "updated_at": "2026-01-01T00:00:00Z",
  "expires_at": "2026-12-31T00:00:00Z"
}`)

	if err := os.WriteFile(legacyPath, legacyData, 0600); err != nil {
		t.Fatalf("write legacy: %v", err)
	}

	manager := &Manager{
		store: &Store{Cookies: make([]*http.Cookie, 0)},
		path:  legacyPath,
		secure: newEncryptedFileStore(dir),
	}

	if err := manager.LoadSecurely(); err != nil {
		t.Fatalf("load: %v", err)
	}

	if !manager.HasSessionCookies() {
		t.Fatal("expected migrated session cookies")
	}

	if _, err := os.Stat(legacyPath); !os.IsNotExist(err) {
		t.Fatal("expected legacy plaintext file removed after migration")
	}
}
