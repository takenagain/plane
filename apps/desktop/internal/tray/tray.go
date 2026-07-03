package tray

import (
	"fmt"
	"time"

	"github.com/getlantern/systray"
	"github.com/takenagain/plane/apps/desktop/internal/timer"
	"github.com/takenagain/plane/apps/desktop/pkg/models"
)

// Manager handles system tray functionality
type Manager struct {
	timerManager  *timer.Manager
	onStop        func()
	onStart       func(*models.Issue)
	onShowWindow  func()
	onSettings    func()
	onQuit        func()

	// Menu items
	timerItem    *systray.MenuItem
	stopItem     *systray.MenuItem
	startItem    *systray.MenuItem
	searchItem   *systray.MenuItem
	showItem     *systray.MenuItem
	settingsItem *systray.MenuItem
	quitItem     *systray.MenuItem
}

// NewManager creates a new system tray manager
func NewManager(tm *timer.Manager) *Manager {
	return &Manager{
		timerManager: tm,
	}
}

// SetCallbacks sets the callback functions for tray actions
func (m *Manager) SetCallbacks(
	onStop func(),
	onStart func(*models.Issue),
	onShowWindow func(),
	onSettings func(),
	onQuit func(),
) {
	m.onStop = onStop
	m.onStart = onStart
	m.onShowWindow = onShowWindow
	m.onSettings = onSettings
	m.onQuit = onQuit
}

// Run starts the system tray (this is blocking)
func (m *Manager) Run() {
	systray.Run(m.onReady, m.onExit)
}

// onReady is called when the systray is ready
func (m *Manager) onReady() {
	// Set initial icon and tooltip
	systray.SetTitle("Plane")
	systray.SetTooltip("Plane Desktop - No tracking active")

	// TODO: Load actual icon data
	// systray.SetIcon(iconData)

	// Create menu items
	m.timerItem = systray.AddMenuItem("No tracking active", "Current time tracking status")
	m.timerItem.Disable()

	systray.AddSeparator()

	m.stopItem = systray.AddMenuItem("⏹  Stop Tracking", "Stop current time tracking")
	m.stopItem.Hide()

	m.startItem = systray.AddMenuItem("▶️  Start Tracking", "Start tracking on a new task")

	m.searchItem = systray.AddMenuItem("🔍 Search Issues", "Search for issues to track")

	systray.AddSeparator()

	m.showItem = systray.AddMenuItem("🪟 Show Window", "Show main application window")

	m.settingsItem = systray.AddMenuItem("⚙️  Settings", "Open settings")

	systray.AddSeparator()

	m.quitItem = systray.AddMenuItem("🚪 Quit", "Quit Plane Desktop")

	// Register timer callback
	m.timerManager.OnTick(m.onTimerTick)

	// Start event loop
	go m.handleEvents()

	// Update menu based on current timer state
	m.updateMenuForState()
}

// onExit is called when the systray is exiting
func (m *Manager) onExit() {
	// Cleanup
}

// handleEvents processes menu item clicks
func (m *Manager) handleEvents() {
	for {
		select {
		case <-m.stopItem.ClickedCh:
			if m.onStop != nil {
				m.onStop()
			}

		case <-m.startItem.ClickedCh:
			// TODO: Show issue selection dialog
			// For now, just call the callback with nil
			if m.onStart != nil {
				m.onStart(nil)
			}

		case <-m.searchItem.ClickedCh:
			// TODO: Show search dialog
			if m.onStart != nil {
				m.onStart(nil)
			}

		case <-m.showItem.ClickedCh:
			if m.onShowWindow != nil {
				m.onShowWindow()
			}

		case <-m.settingsItem.ClickedCh:
			if m.onSettings != nil {
				m.onSettings()
			}

		case <-m.quitItem.ClickedCh:
			if m.onQuit != nil {
				m.onQuit()
			}
			systray.Quit()
			return
		}
	}
}

// onTimerTick is called every second when the timer is active
func (m *Manager) onTimerTick(state *timer.State) {
	if state.IsActive {
		elapsed := time.Duration(state.ElapsedSecs) * time.Second
		formattedTime := timer.FormatDuration(elapsed)

		// Update timer display
		m.timerItem.SetTitle(fmt.Sprintf("⏱️  %s - %s", formattedTime, state.IssueTitle))
		m.timerItem.SetTooltip(fmt.Sprintf("Tracking: %s\nElapsed: %s", state.IssueTitle, formattedTime))

		systray.SetTooltip(fmt.Sprintf("Plane Desktop - Tracking: %s", formattedTime))

		// Show stop button, hide start button
		m.stopItem.Show()
		m.startItem.Hide()
	} else {
		// Reset to idle state
		m.timerItem.SetTitle("No tracking active")
		m.timerItem.SetTooltip("No time tracking active")
		systray.SetTooltip("Plane Desktop - No tracking active")

		// Hide stop button, show start button
		m.stopItem.Hide()
		m.startItem.Show()
	}
}

// updateMenuForState updates the menu based on current timer state
func (m *Manager) updateMenuForState() {
	state := m.timerManager.GetState()
	m.onTimerTick(&state)
}

// SetAuthenticated updates tray messaging for the auth state.
func (m *Manager) SetAuthenticated(authenticated bool) {
	if authenticated {
		systray.SetTooltip("Plane Desktop - Signed in")
		return
	}

	systray.SetTooltip("Plane Desktop - Sign in required")
}
