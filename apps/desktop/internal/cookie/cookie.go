package cookie

import (
	"encoding/json"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// Store represents stored cookies with metadata
type Store struct {
	Cookies   []*http.Cookie `json:"cookies"`
	UpdatedAt time.Time      `json:"updated_at"`
	ExpiresAt time.Time      `json:"expires_at"`
}

// Manager handles cookie extraction and storage
type Manager struct {
	store  *Store
	path   string
	secure SecureStore
}

// NewManager creates a new cookie manager
func NewManager() (*Manager, error) {
	cookiePath, err := getCookiePath()
	if err != nil {
		return nil, err
	}

	return &Manager{
		store: &Store{
			Cookies:   make([]*http.Cookie, 0),
			UpdatedAt: time.Now(),
		},
		path:   cookiePath,
		secure: newSecureStore(storageDir(cookiePath)),
	}, nil
}

// SetCookies stores cookies from authentication
func (m *Manager) SetCookies(cookies []*http.Cookie) {
	m.store.Cookies = cookies
	m.store.UpdatedAt = time.Now()

	// Default to Plane's SESSION_COOKIE_AGE (7 days) when cookies are session-scoped.
	expiresAt := time.Now().Add(7 * 24 * time.Hour)
	for _, cookie := range cookies {
		if !cookie.Expires.IsZero() && cookie.Expires.Before(expiresAt) {
			expiresAt = cookie.Expires
		}
	}
	m.store.ExpiresAt = expiresAt
}

// GetCookies returns all stored cookies
func (m *Manager) GetCookies() []*http.Cookie {
	return m.store.Cookies
}

// GetCookiesForRequest returns cookies formatted for HTTP requests
func (m *Manager) GetCookiesForRequest(domain string) []*http.Cookie {
	validCookies := make([]*http.Cookie, 0)

	for _, cookie := range m.store.Cookies {
		// Check if cookie is expired
		if !cookie.Expires.IsZero() && cookie.Expires.Before(time.Now()) {
			continue
		}

		cookieDomain := strings.TrimPrefix(strings.ToLower(cookie.Domain), ".")
		requestDomain := strings.ToLower(domain)
		if cookieDomain == "" ||
			cookieDomain == requestDomain ||
			strings.HasSuffix(requestDomain, "."+cookieDomain) {
			validCookies = append(validCookies, cookie)
		}
	}

	return validCookies
}

// IsValid checks if the stored cookies are still valid
func (m *Manager) IsValid() bool {
	if len(m.store.Cookies) == 0 {
		return false
	}

	// Check if the store has expired
	if !m.store.ExpiresAt.IsZero() && m.store.ExpiresAt.Before(time.Now()) {
		return false
	}

	return true
}

// SaveSecurely persists cookies using OS keyring when available, otherwise AES-GCM
// encryption with a machine-local key (see secure_store.go).
func (m *Manager) SaveSecurely() error {
	if m.secure == nil {
		m.secure = newSecureStore(storageDir(m.path))
	}

	data, err := json.MarshalIndent(m.store, "", "  ")
	if err != nil {
		return err
	}

	if err := m.secure.Save(data); err != nil {
		return err
	}

	// Remove legacy plaintext after successful secure save.
	if err := os.Remove(m.path); err != nil && !os.IsNotExist(err) {
		return err
	}

	return nil
}

// LoadSecurely loads cookies from secure storage, migrating legacy plaintext JSON if present.
func (m *Manager) LoadSecurely() error {
	if m.secure == nil {
		m.secure = newSecureStore(storageDir(m.path))
	}

	if data, err := m.secure.Load(); err == nil {
		return json.Unmarshal(data, m.store)
	}

	// Legacy plaintext migration path.
	if _, err := os.Stat(m.path); os.IsNotExist(err) {
		return nil
	}

	data, err := os.ReadFile(m.path)
	if err != nil {
		return err
	}

	if err := json.Unmarshal(data, m.store); err != nil {
		return err
	}

	log.Printf("Migrating legacy plaintext cookie store (fingerprint %s)", legacyFingerprint(data))
	return m.SaveSecurely()
}

// Clear removes all stored cookies
func (m *Manager) Clear() error {
	m.store = &Store{
		Cookies:   make([]*http.Cookie, 0),
		UpdatedAt: time.Now(),
	}

	if m.secure != nil {
		if err := m.secure.Delete(); err != nil {
			return err
		}
	}

	if err := os.Remove(m.path); err != nil && !os.IsNotExist(err) {
		return err
	}

	return nil
}

// getCookiePath returns the platform-specific cookie file path
func getCookiePath() (string, error) {
	userConfigDir, err := os.UserConfigDir()
	if err != nil {
		return "", err
	}

	return filepath.Join(userConfigDir, "plane-desktop", "cookies.json"), nil
}
