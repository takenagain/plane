package config

import (
	"os"
	"testing"
)

func TestValidatePlaneURLRequiresHTTPS(t *testing.T) {
	t.Setenv("PLANE_DESKTOP_ALLOW_HTTP", "")

	if err := ValidatePlaneURL("http://plane.example.com"); err == nil {
		t.Fatal("expected http url to be rejected")
	}

	if err := ValidatePlaneURL("https://plane.example.com"); err != nil {
		t.Fatalf("expected https url to be accepted: %v", err)
	}
}

func TestValidatePlaneURLAllowsHTTPInDev(t *testing.T) {
	t.Setenv("PLANE_DESKTOP_ALLOW_HTTP", "1")

	if err := ValidatePlaneURL("http://127.0.0.1:8000"); err != nil {
		t.Fatalf("expected http url to be allowed in dev: %v", err)
	}
}

func TestManagerUpdateRejectsInvalidURL(t *testing.T) {
	manager, err := NewManager()
	if err != nil {
		t.Fatalf("new manager: %v", err)
	}

	t.Setenv("PLANE_DESKTOP_ALLOW_HTTP", "")
	if err := manager.Update(&Config{PlaneURL: "javascript:alert(1)"}); err == nil {
		t.Fatal("expected invalid url to be rejected")
	}
}

func TestManagerLoadAcceptsDefaultHTTPS(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("XDG_CONFIG_HOME", dir)
	os.Unsetenv("PLANE_DESKTOP_ALLOW_HTTP")

	manager, err := NewManager()
	if err != nil {
		t.Fatalf("new manager: %v", err)
	}

	if err := manager.Load(); err != nil {
		t.Fatalf("load default config: %v", err)
	}
}
