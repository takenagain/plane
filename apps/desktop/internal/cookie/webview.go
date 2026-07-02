package cookie

import (
	"errors"
	"fmt"
	"net/http"
	"strings"
)

var (
	// ErrNoSessionCookies is returned when no usable auth cookies are available.
	ErrNoSessionCookies = errors.New("no session cookies found for plane host")
)

// SessionCookieNames lists Plane auth cookies to look for after web login.
var SessionCookieNames = []string{
	"session-id",
	"sessionid",
	"csrftoken",
	"csrf_token",
}

// ExtractFromWebview stores cookies captured from the embedded login webview.
func (m *Manager) ExtractFromWebview(planeURL string, cookies []*http.Cookie) error {
	if m == nil {
		return fmt.Errorf("cookie manager is nil")
	}

	filtered := FilterForHost(cookies, planeURL)
	if len(filtered) == 0 {
		filtered = cookies
	}

	if len(filtered) == 0 {
		return ErrNoSessionCookies
	}

	for _, cookie := range filtered {
		NormalizeExpiry(cookie)
	}

	merged := MergeCookies(m.store.Cookies, filtered)
	m.SetCookies(merged)

	return m.SaveSecurely()
}

// HasSessionCookies reports whether stored cookies include a Plane session.
func (m *Manager) HasSessionCookies() bool {
	if m == nil || len(m.store.Cookies) == 0 {
		return false
	}

	for _, cookie := range m.store.Cookies {
		for _, name := range SessionCookieNames {
			if strings.EqualFold(cookie.Name, name) && cookie.Value != "" {
				return true
			}
		}
	}

	return len(m.store.Cookies) > 0
}
