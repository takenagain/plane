package cookie

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestParseCookieHeader(t *testing.T) {
	cookies := ParseCookieHeader("session-id=abc123; csrftoken=def456")
	if len(cookies) != 2 {
		t.Fatalf("expected 2 cookies, got %d", len(cookies))
	}

	if cookies[0].Name != "session-id" || cookies[0].Value != "abc123" {
		t.Fatalf("unexpected first cookie: %+v", cookies[0])
	}
}

func TestFilterForHost(t *testing.T) {
	cookies := []*http.Cookie{
		{Name: "session-id", Value: "abc", Domain: "plane.example.com"},
		{Name: "other", Value: "x", Domain: "other.example.com"},
	}

	filtered := FilterForHost(cookies, "https://plane.example.com")
	if len(filtered) != 1 {
		t.Fatalf("expected 1 cookie, got %d", len(filtered))
	}
}

func TestManagerExtractFromWebview(t *testing.T) {
	dir := t.TempDir()
	manager := &Manager{
		store: &Store{Cookies: make([]*http.Cookie, 0), UpdatedAt: time.Now()},
		path:  dir + "/cookies.json",
	}

	err := manager.ExtractFromWebview("https://plane.example.com", []*http.Cookie{
		{Name: "session-id", Value: "token", Path: "/"},
	})
	if err != nil {
		t.Fatalf("extract failed: %v", err)
	}

	if !manager.HasSessionCookies() {
		t.Fatal("expected session cookies to be stored")
	}

	if err := manager.LoadSecurely(); err != nil {
		t.Fatalf("load failed: %v", err)
	}

	if len(manager.GetCookies()) != 1 {
		t.Fatalf("expected persisted cookie, got %d", len(manager.GetCookies()))
	}
}

func TestLoginProxyCapturesCookies(t *testing.T) {
	backend := http.NewServeMux()
	backend.HandleFunc("/sign-in/", func(w http.ResponseWriter, r *http.Request) {
		http.SetCookie(w, &http.Cookie{
			Name:     "session-id",
			Value:    "proxy-session",
			Path:     "/",
			HttpOnly: true,
		})
		w.WriteHeader(http.StatusOK)
	})

	server := httptest.NewServer(backend)
	defer server.Close()

	var captured []*http.Cookie
	proxy, err := NewLoginProxy(server.URL, func(cookies []*http.Cookie) {
		captured = append(captured, cookies...)
	})
	if err != nil {
		t.Fatalf("new proxy: %v", err)
	}

	proxyURL, err := proxy.Start()
	if err != nil {
		t.Fatalf("start proxy: %v", err)
	}
	defer proxy.Stop()

	resp, err := http.Get(proxyURL + "/sign-in/")
	if err != nil {
		t.Fatalf("proxy request failed: %v", err)
	}
	resp.Body.Close()

	if len(captured) == 0 {
		t.Fatal("expected proxy to capture cookies")
	}
}
