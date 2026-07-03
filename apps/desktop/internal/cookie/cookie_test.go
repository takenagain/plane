package cookie

import (
	"net/http"
	"net/http/httptest"
	"strings"
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
		store:  &Store{Cookies: make([]*http.Cookie, 0), UpdatedAt: time.Now()},
		path:   dir + "/cookies.json",
		secure: newEncryptedFileStore(dir),
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

func TestHasSessionCookiesRequiresSessionID(t *testing.T) {
	manager := &Manager{
		store: &Store{Cookies: []*http.Cookie{
			{Name: "csrftoken", Value: "abc", Domain: "plane.example.com"},
		}},
	}

	if manager.HasSessionCookies() {
		t.Fatal("csrftoken alone should not count as an authenticated session")
	}

	manager.store.Cookies = append(manager.store.Cookies, &http.Cookie{
		Name: "session-id", Value: "token", Domain: "plane.example.com",
	})

	if !manager.HasSessionCookies() {
		t.Fatal("expected session-id to satisfy HasSessionCookies")
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

	if _, err := proxy.Start(); err != nil {
		t.Fatalf("start proxy: %v", err)
	}
	defer proxy.Stop()

	resp, err := http.Get(proxy.URLWithBootstrap("/sign-in/"))
	if err != nil {
		t.Fatalf("proxy request failed: %v", err)
	}
	resp.Body.Close()

	if len(captured) == 0 {
		t.Fatal("expected proxy to capture cookies")
	}
}

func TestLoginProxyStripsFrameHeaders(t *testing.T) {
	backend := http.NewServeMux()
	backend.HandleFunc("/sign-in/", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Frame-Options", "DENY")
		w.Header().Set("Content-Security-Policy", "frame-ancestors 'none'")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("<html><body>sign in</body></html>"))
	})

	server := httptest.NewServer(backend)
	defer server.Close()

	proxy, err := NewLoginProxy(server.URL, nil)
	if err != nil {
		t.Fatalf("new proxy: %v", err)
	}

	if _, err := proxy.Start(); err != nil {
		t.Fatalf("start proxy: %v", err)
	}
	defer proxy.Stop()

	resp, err := http.Get(proxy.URLWithBootstrap("/sign-in/"))
	if err != nil {
		t.Fatalf("proxy request failed: %v", err)
	}
	defer resp.Body.Close()

	if resp.Header.Get("X-Frame-Options") != "" {
		t.Fatalf("expected X-Frame-Options stripped, got %q", resp.Header.Get("X-Frame-Options"))
	}
	if resp.Header.Get("Content-Security-Policy") != "" {
		t.Fatalf("expected CSP stripped, got %q", resp.Header.Get("Content-Security-Policy"))
	}
}

func TestLoginProxyRewritesSecureCookies(t *testing.T) {
	backend := http.NewServeMux()
	backend.HandleFunc("/sign-in/", func(w http.ResponseWriter, r *http.Request) {
		http.SetCookie(w, &http.Cookie{
			Name:     "csrftoken",
			Value:    "abc",
			Path:     "/",
			Secure:   true,
			SameSite: http.SameSiteNoneMode,
		})
		w.WriteHeader(http.StatusOK)
	})

	server := httptest.NewServer(backend)
	defer server.Close()

	proxy, err := NewLoginProxy(server.URL, nil)
	if err != nil {
		t.Fatalf("new proxy: %v", err)
	}

	if _, err := proxy.Start(); err != nil {
		t.Fatalf("start proxy: %v", err)
	}
	defer proxy.Stop()

	resp, err := http.Get(proxy.URLWithBootstrap("/sign-in/"))
	if err != nil {
		t.Fatalf("proxy request failed: %v", err)
	}
	defer resp.Body.Close()

	setCookie := resp.Header.Get("Set-Cookie")
	if strings.Contains(setCookie, "Secure") {
		t.Fatalf("expected Secure stripped from Set-Cookie, got %q", setCookie)
	}
}

func TestLoginProxyRequiresBootstrap(t *testing.T) {
	backend := http.NewServeMux()
	backend.HandleFunc("/api/", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})

	server := httptest.NewServer(backend)
	defer server.Close()

	proxy, err := NewLoginProxy(server.URL, nil)
	if err != nil {
		t.Fatalf("new proxy: %v", err)
	}

	if _, err := proxy.Start(); err != nil {
		t.Fatalf("start proxy: %v", err)
	}
	defer proxy.Stop()

	unauthorized, err := http.Get(proxy.BaseURL() + "/api/me/")
	if err != nil {
		t.Fatalf("proxy request failed: %v", err)
	}
	unauthorized.Body.Close()
	if unauthorized.StatusCode != http.StatusForbidden {
		t.Fatalf("expected 403 without bootstrap, got %d", unauthorized.StatusCode)
	}

	authorized, err := http.Get(proxy.URLWithBootstrap("/api/me/"))
	if err != nil {
		t.Fatalf("bootstrap proxy request failed: %v", err)
	}
	authorized.Body.Close()
	if authorized.StatusCode != http.StatusOK {
		t.Fatalf("expected 200 with bootstrap, got %d", authorized.StatusCode)
	}
}

func TestLoginProxyDoesNotInjectStoredSessionCookies(t *testing.T) {
	backend := http.NewServeMux()
	backend.HandleFunc("/api/", func(w http.ResponseWriter, r *http.Request) {
		if _, err := r.Cookie("session-id"); err == nil {
			t.Fatal("proxy must not inject stored session cookies into proxied requests")
		}
		w.WriteHeader(http.StatusOK)
	})

	server := httptest.NewServer(backend)
	defer server.Close()

	proxy, err := NewLoginProxy(server.URL, nil)
	if err != nil {
		t.Fatalf("new proxy: %v", err)
	}

	if _, err := proxy.Start(); err != nil {
		t.Fatalf("start proxy: %v", err)
	}
	defer proxy.Stop()

	resp, err := http.Get(proxy.URLWithBootstrap("/api/me/"))
	if err != nil {
		t.Fatalf("bootstrap proxy request failed: %v", err)
	}
	resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200 with bootstrap, got %d", resp.StatusCode)
	}
}
