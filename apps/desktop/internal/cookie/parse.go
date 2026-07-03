package cookie

import (
	"net/http"
	"net/url"
	"strings"
	"time"
)

// ParseCookieHeader parses a Cookie request header value into http.Cookie values.
func ParseCookieHeader(header string) []*http.Cookie {
	header = strings.TrimSpace(header)
	if header == "" {
		return nil
	}

	cookies := make([]*http.Cookie, 0)
	for _, part := range strings.Split(header, ";") {
		part = strings.TrimSpace(part)
		if part == "" {
			continue
		}

		name, value, ok := strings.Cut(part, "=")
		if !ok || name == "" {
			continue
		}

		cookies = append(cookies, &http.Cookie{
			Name:  strings.TrimSpace(name),
			Value: strings.TrimSpace(value),
		})
	}

	return cookies
}

// FilterForHost keeps cookies that apply to the given Plane instance URL.
func FilterForHost(cookies []*http.Cookie, planeURL string) []*http.Cookie {
	host, err := hostFromURL(planeURL)
	if err != nil || host == "" {
		return nil
	}

	filtered := make([]*http.Cookie, 0, len(cookies))
	for _, cookie := range cookies {
		if cookie == nil || cookie.Name == "" {
			continue
		}

		domain := strings.TrimPrefix(strings.ToLower(cookie.Domain), ".")
		if domain == "" || domain == host || strings.HasSuffix(host, "."+domain) {
			filtered = append(filtered, cookie)
		}
	}

	return filtered
}

// MergeCookies combines existing cookies with new ones, preferring newer values.
func MergeCookies(existing, incoming []*http.Cookie) []*http.Cookie {
	merged := make(map[string]*http.Cookie, len(existing)+len(incoming))

	for _, cookie := range existing {
		if cookie == nil {
			continue
		}
		merged[cookieKey(cookie)] = cookie
	}

	for _, cookie := range incoming {
		if cookie == nil {
			continue
		}
		merged[cookieKey(cookie)] = cookie
	}

	result := make([]*http.Cookie, 0, len(merged))
	for _, cookie := range merged {
		result = append(result, cookie)
	}

	return result
}

func cookieKey(cookie *http.Cookie) string {
	return strings.ToLower(cookie.Name) + "|" + strings.ToLower(cookie.Path) + "|" + strings.ToLower(cookie.Domain)
}

func hostFromURL(rawURL string) (string, error) {
	parsed, err := url.Parse(rawURL)
	if err != nil {
		return "", err
	}

	host := parsed.Hostname()
	if host == "" {
		return "", nil
	}

	return strings.ToLower(host), nil
}

// HostFromPlaneURL returns the hostname for a Plane instance URL.
func HostFromPlaneURL(rawURL string) (string, error) {
	return hostFromURL(rawURL)
}

// NormalizeExpiry ensures cookie expiration metadata is usable by the manager.
func NormalizeExpiry(cookie *http.Cookie) {
	if cookie == nil {
		return
	}

	if !cookie.Expires.IsZero() {
		return
	}

	if cookie.MaxAge > 0 {
		cookie.Expires = time.Now().Add(time.Duration(cookie.MaxAge) * time.Second)
	}
}
