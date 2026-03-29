package cookie

import (
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
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
	store *Store
	path  string
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
		path: cookiePath,
	}, nil
}

// SetCookies stores cookies from authentication
func (m *Manager) SetCookies(cookies []*http.Cookie) {
	m.store.Cookies = cookies
	m.store.UpdatedAt = time.Now()

	// Set expiration to the earliest cookie expiration or 24 hours
	expiresAt := time.Now().Add(24 * time.Hour)
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

		// Basic domain matching
		if cookie.Domain == "" || cookie.Domain == domain {
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

// SaveSecurely saves cookies to disk
// TODO: Implement platform-specific secure storage (keychain, credential manager, etc.)
func (m *Manager) SaveSecurely() error {
	// Ensure directory exists
	dir := filepath.Dir(m.path)
	if err := os.MkdirAll(dir, 0700); err != nil {
		return err
	}

	data, err := json.MarshalIndent(m.store, "", "  ")
	if err != nil {
		return err
	}

	// Write to temp file first, then rename (atomic operation)
	tempPath := m.path + ".tmp"
	if err := os.WriteFile(tempPath, data, 0600); err != nil {
		return err
	}

	return os.Rename(tempPath, m.path)
}

// LoadSecurely loads cookies from disk
// TODO: Implement platform-specific secure storage (keychain, credential manager, etc.)
func (m *Manager) LoadSecurely() error {
	// If cookie file doesn't exist, return empty store
	if _, err := os.Stat(m.path); os.IsNotExist(err) {
		return nil
	}

	data, err := os.ReadFile(m.path)
	if err != nil {
		return err
	}

	return json.Unmarshal(data, m.store)
}

// Clear removes all stored cookies
func (m *Manager) Clear() error {
	m.store = &Store{
		Cookies:   make([]*http.Cookie, 0),
		UpdatedAt: time.Now(),
	}

	// Remove the cookie file
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
