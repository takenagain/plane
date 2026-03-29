package timer

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"time"

	"github.com/takenagain/plane/apps/desktop/pkg/models"
)

// State represents the timer state
type State struct {
	WorklogID   string    `json:"worklog_id"`
	IssueID     string    `json:"issue_id"`
	IssueTitle  string    `json:"issue_title"`
	ProjectID   string    `json:"project_id"`
	StartTime   time.Time `json:"start_time"`
	ElapsedSecs int64     `json:"elapsed_seconds"`
	IsActive    bool      `json:"is_active"`
}

// Manager handles timer functionality
type Manager struct {
	state    *State
	ticker   *time.Ticker
	stopChan chan bool
	mu       sync.RWMutex
	statePath string
	callbacks []func(*State)
}

// NewManager creates a new timer manager
func NewManager() (*Manager, error) {
	statePath, err := getStatePath()
	if err != nil {
		return nil, err
	}

	m := &Manager{
		state: &State{
			IsActive: false,
		},
		stopChan:  make(chan bool),
		statePath: statePath,
		callbacks: make([]func(*State), 0),
	}

	// Try to load saved state
	if err := m.loadState(); err != nil {
		// If loading fails, start with empty state
		fmt.Printf("Warning: could not load timer state: %v\n", err)
	}

	return m, nil
}

// Start starts the timer for a worklog
func (m *Manager) Start(worklog *models.WorkLog, issueTitle, projectID string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	// Stop existing timer if active
	if m.state.IsActive {
		m.stopTimer()
	}

	m.state = &State{
		WorklogID:   worklog.ID,
		IssueID:     worklog.IssueID,
		IssueTitle:  issueTitle,
		ProjectID:   projectID,
		StartTime:   worklog.StartTime,
		ElapsedSecs: 0,
		IsActive:    true,
	}

	// Save state immediately
	if err := m.saveState(); err != nil {
		return fmt.Errorf("failed to save timer state: %w", err)
	}

	// Start ticker
	m.startTimer()

	// Notify callbacks
	m.notifyCallbacks()

	return nil
}

// Stop stops the timer
func (m *Manager) Stop() {
	m.mu.Lock()
	defer m.mu.Unlock()

	if !m.state.IsActive {
		return
	}

	m.stopTimer()
	m.state.IsActive = false

	// Save state
	m.saveState()

	// Notify callbacks
	m.notifyCallbacks()
}

// GetElapsed returns the elapsed duration
func (m *Manager) GetElapsed() time.Duration {
	m.mu.RLock()
	defer m.mu.RUnlock()

	if !m.state.IsActive {
		return 0
	}

	return time.Duration(m.state.ElapsedSecs) * time.Second
}

// GetState returns a copy of the current state
func (m *Manager) GetState() State {
	m.mu.RLock()
	defer m.mu.RUnlock()

	return *m.state
}

// IsActive returns whether the timer is currently active
func (m *Manager) IsActive() bool {
	m.mu.RLock()
	defer m.mu.RUnlock()

	return m.state.IsActive
}

// OnTick registers a callback to be called on every tick
func (m *Manager) OnTick(callback func(*State)) {
	m.mu.Lock()
	defer m.mu.Unlock()

	m.callbacks = append(m.callbacks, callback)
}

// startTimer starts the internal ticker (must be called with lock held)
func (m *Manager) startTimer() {
	m.ticker = time.NewTicker(1 * time.Second)

	go func() {
		for {
			select {
			case <-m.ticker.C:
				m.tick()
			case <-m.stopChan:
				return
			}
		}
	}()
}

// stopTimer stops the internal ticker (must be called with lock held)
func (m *Manager) stopTimer() {
	if m.ticker != nil {
		m.ticker.Stop()
		m.stopChan <- true
	}
}

// tick increments the elapsed time and notifies callbacks
func (m *Manager) tick() {
	m.mu.Lock()
	m.state.ElapsedSecs = int64(time.Since(m.state.StartTime).Seconds())

	// Auto-save every minute
	if m.state.ElapsedSecs%60 == 0 {
		m.saveState()
	}
	m.mu.Unlock()

	m.notifyCallbacks()
}

// notifyCallbacks calls all registered callbacks
func (m *Manager) notifyCallbacks() {
	state := m.GetState()
	for _, callback := range m.callbacks {
		go callback(&state)
	}
}

// saveState saves the current state to disk
func (m *Manager) saveState() error {
	dir := filepath.Dir(m.statePath)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return err
	}

	data, err := json.MarshalIndent(m.state, "", "  ")
	if err != nil {
		return err
	}

	// Write to temp file first
	tempPath := m.statePath + ".tmp"
	if err := os.WriteFile(tempPath, data, 0644); err != nil {
		return err
	}

	return os.Rename(tempPath, m.statePath)
}

// loadState loads the state from disk
func (m *Manager) loadState() error {
	if _, err := os.Stat(m.statePath); os.IsNotExist(err) {
		return nil
	}

	data, err := os.ReadFile(m.statePath)
	if err != nil {
		return err
	}

	var state State
	if err := json.Unmarshal(data, &state); err != nil {
		return err
	}

	// If the loaded state was active, restore the timer
	if state.IsActive {
		m.state = &state
		m.startTimer()
	}

	return nil
}

// FormatDuration formats a duration as HH:MM:SS
func FormatDuration(d time.Duration) string {
	hours := int(d.Hours())
	minutes := int(d.Minutes()) % 60
	seconds := int(d.Seconds()) % 60

	return fmt.Sprintf("%02d:%02d:%02d", hours, minutes, seconds)
}

// getStatePath returns the platform-specific state file path
func getStatePath() (string, error) {
	userConfigDir, err := os.UserConfigDir()
	if err != nil {
		return "", err
	}

	return filepath.Join(userConfigDir, "plane-desktop", "timer-state.json"), nil
}
