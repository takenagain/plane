package config

import (
	"encoding/json"
	"os"
	"path/filepath"
)

// Config represents the application configuration
type Config struct {
	PlaneURL            string `json:"plane_url"`
	StartMinimized      bool   `json:"start_minimized"`
	NotificationSound   bool   `json:"notification_sound"`
	LongSessionAlert    int    `json:"long_session_alert_minutes"` // 0 = disabled
	LastWorkspace       string `json:"last_workspace"`
	SyncIntervalMinutes int    `json:"sync_interval_minutes"`
}

// DefaultConfig returns a config with default values
func DefaultConfig() *Config {
	return &Config{
		PlaneURL:            "https://plan.francoisvw.com",
		StartMinimized:      false,
		NotificationSound:   true,
		LongSessionAlert:    120, // 2 hours
		LastWorkspace:       "",
		SyncIntervalMinutes: 5,
	}
}

// Manager handles configuration loading and saving
type Manager struct {
	config *Config
	path   string
}

// NewManager creates a new configuration manager
func NewManager() (*Manager, error) {
	configPath, err := getConfigPath()
	if err != nil {
		return nil, err
	}

	return &Manager{
		config: DefaultConfig(),
		path:   configPath,
	}, nil
}

// Load reads the configuration from disk
func (m *Manager) Load() error {
	// If config file doesn't exist, use defaults
	if _, err := os.Stat(m.path); os.IsNotExist(err) {
		return nil
	}

	data, err := os.ReadFile(m.path)
	if err != nil {
		return err
	}

	return json.Unmarshal(data, m.config)
}

// Save writes the configuration to disk
func (m *Manager) Save() error {
	// Ensure directory exists
	dir := filepath.Dir(m.path)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return err
	}

	data, err := json.MarshalIndent(m.config, "", "  ")
	if err != nil {
		return err
	}

	// Write to temp file first, then rename (atomic operation)
	tempPath := m.path + ".tmp"
	if err := os.WriteFile(tempPath, data, 0644); err != nil {
		return err
	}

	return os.Rename(tempPath, m.path)
}

// Get returns the current configuration
func (m *Manager) Get() *Config {
	return m.config
}

// Update updates the configuration
func (m *Manager) Update(config *Config) {
	m.config = config
}

// GetConfigPath returns the platform-specific config file path
func getConfigPath() (string, error) {
	userConfigDir, err := os.UserConfigDir()
	if err != nil {
		return "", err
	}

	return filepath.Join(userConfigDir, "plane-desktop", "config.json"), nil
}
