package main

import (
	"context"
	"fmt"
	"log"

	"github.com/takenagain/plane/apps/desktop/internal/api"
	"github.com/takenagain/plane/apps/desktop/internal/config"
	"github.com/takenagain/plane/apps/desktop/internal/cookie"
	"github.com/takenagain/plane/apps/desktop/internal/timer"
	"github.com/takenagain/plane/apps/desktop/internal/tray"
	"github.com/takenagain/plane/apps/desktop/pkg/models"
	"github.com/wailsapp/wails/v2/pkg/runtime"
)

const eventOpenIssueSelection = "open-issue-selection"

// App struct
type App struct {
	ctx              context.Context
	configMgr        *config.Manager
	cookieMgr        *cookie.Manager
	timerMgr         *timer.Manager
	trayMgr          *tray.Manager
	apiClient        *api.Client
	currentUser      *models.User
	currentWorkspace *models.Workspace
	auth             authController
}

// NewApp creates a new App application struct
func NewApp() *App {
	return &App{}
}

// startup is called when the app starts. The context is saved
// so we can call the runtime methods
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx

	// Initialize managers
	var err error

	// Config manager
	a.configMgr, err = config.NewManager()
	if err != nil {
		log.Printf("Failed to create config manager: %v", err)
		return
	}

	// Load config
	if err := a.configMgr.Load(); err != nil {
		log.Printf("Failed to load config: %v", err)
	}

	// Cookie manager
	a.cookieMgr, err = cookie.NewManager()
	if err != nil {
		log.Printf("Failed to create cookie manager: %v", err)
		return
	}

	// Load cookies
	if err := a.cookieMgr.LoadSecurely(); err != nil {
		log.Printf("Failed to load cookies: %v", err)
	}

	// Timer manager
	a.timerMgr, err = timer.NewManager()
	if err != nil {
		log.Printf("Failed to create timer manager: %v", err)
		return
	}

	// API client
	cfg := a.configMgr.Get()
	a.apiClient = api.NewClient(cfg.PlaneURL, a.cookieMgr)

	// Tray manager (optional — disabled on Linux by default; see tray.Supported)
	if tray.Supported() {
		a.trayMgr = tray.NewManager(a.timerMgr)
		a.trayMgr.SetCallbacks(
			a.handleStopTracking,
			a.handleStartTracking,
			a.handleShowWindow,
			a.handleSettings,
			a.handleQuit,
		)
		go a.trayMgr.Run()
	} else {
		log.Printf("System tray disabled (on Linux set PLANE_DESKTOP_ENABLE_TRAY=1 to opt in)")
	}

	// Authenticate or show login webview
	a.bootstrapAuth()
}

// authenticate attempts to authenticate with stored cookies
func (a *App) authenticate() error {
	user, err := a.apiClient.GetCurrentUser()
	if err != nil {
		return fmt.Errorf("failed to get current user: %w", err)
	}
	a.currentUser = user

	workspaces, err := a.apiClient.GetWorkspaces()
	if err != nil {
		// Session is still valid; workspace list can be retried later.
		log.Printf("Failed to load workspaces: %v", err)
		return nil
	}

	// Set current workspace (use last workspace from config or first available)
	cfg := a.configMgr.Get()
	for _, ws := range workspaces {
		if ws.Slug == cfg.LastWorkspace {
			a.currentWorkspace = &ws
			break
		}
	}
	if a.currentWorkspace == nil && len(workspaces) > 0 {
		a.currentWorkspace = &workspaces[0]
		cfg.LastWorkspace = a.currentWorkspace.Slug
		a.configMgr.Save()
	}

	return nil
}

// handleStopTracking handles stopping time tracking
func (a *App) handleStopTracking() {
	if !a.timerMgr.IsActive() {
		return
	}

	state := a.timerMgr.GetState()

	// Stop timer locally first
	a.timerMgr.Stop()

	// Stop on backend
	if a.currentWorkspace != nil {
		err := a.apiClient.StopTimeTracking(
			a.currentWorkspace.Slug,
			state.ProjectID,
			state.IssueID,
			state.WorklogID,
		)
		if err != nil {
			log.Printf("Failed to stop tracking on backend: %v", err)
			// TODO: Show error notification
		}
	}

	// TODO: Show success notification
	log.Printf("Stopped tracking: %s", state.IssueTitle)
}

// handleStartTracking handles starting time tracking
func (a *App) handleStartTracking(issue *models.Issue) {
	if issue == nil {
		a.openIssueSelectionDialog()
		return
	}

	if err := a.startTrackingForIssue(issue); err != nil {
		log.Printf("Failed to start tracking: %v", err)
	}
}

func (a *App) openIssueSelectionDialog() {
	if a.ctx == nil {
		return
	}

	if !a.IsAuthenticated() {
		_ = a.OpenLogin()
		return
	}

	runtime.WindowShow(a.ctx)
	runtime.EventsEmit(a.ctx, eventOpenIssueSelection)
}

func (a *App) startTrackingForIssue(issue *models.Issue) error {
	if issue == nil {
		return fmt.Errorf("issue is required")
	}

	if a.apiClient == nil || a.timerMgr == nil {
		return fmt.Errorf("app not initialized")
	}

	if a.currentWorkspace == nil {
		return fmt.Errorf("not authenticated")
	}

	// Single global timer — stop any active session before starting a new one.
	if a.timerMgr.IsActive() {
		if err := a.StopTracking(); err != nil {
			return fmt.Errorf("failed to stop current tracking: %w", err)
		}
	}

	worklog, err := a.apiClient.StartTimeTracking(
		a.currentWorkspace.Slug,
		issue.ProjectID,
		issue.ID,
	)
	if err != nil {
		return fmt.Errorf("failed to start tracking on backend: %w", err)
	}

	issueTitle := issue.Name
	if issueTitle == "" {
		issueTitle = issue.DisplayIdentifier()
	}

	if err := a.timerMgr.Start(worklog, issueTitle, issue.ProjectID); err != nil {
		return fmt.Errorf("failed to start local timer: %w", err)
	}

	log.Printf("Started tracking: %s", issueTitle)
	return nil
}

// handleShowWindow shows the main application window
func (a *App) handleShowWindow() {
	runtime.WindowShow(a.ctx)
}

// handleSettings opens the settings dialog
func (a *App) handleSettings() {
	if !a.IsAuthenticated() {
		_ = a.OpenLogin()
		return
	}

	// TODO: Implement settings dialog
	log.Println("Settings not yet implemented")
}

// handleQuit quits the application
func (a *App) handleQuit() {
	// Stop any active tracking
	if a.timerMgr.IsActive() {
		a.handleStopTracking()
	}

	// Save config
	if a.configMgr != nil {
		a.configMgr.Save()
	}

	// Persist session cookies on quit
	if a.cookieMgr != nil && a.IsAuthenticated() {
		if err := a.cookieMgr.SaveSecurely(); err != nil {
			log.Printf("Failed to save cookies on quit: %v", err)
		}
	}

	runtime.Quit(a.ctx)
}

// Frontend-callable methods

// GetConfig returns the current configuration
func (a *App) GetConfig() *config.Config {
	if a.configMgr == nil {
		return config.DefaultConfig()
	}
	return a.configMgr.Get()
}

// UpdateConfig updates the configuration
func (a *App) UpdateConfig(cfg *config.Config) error {
	if a.configMgr == nil {
		return fmt.Errorf("config manager not initialized")
	}

	a.configMgr.Update(cfg)
	return a.configMgr.Save()
}

// GetTimerState returns the current timer state
func (a *App) GetTimerState() *timer.State {
	if a.timerMgr == nil {
		return &timer.State{IsActive: false}
	}

	state := a.timerMgr.GetState()
	return &state
}

// GetCurrentUser returns the current user
func (a *App) GetCurrentUser() *models.User {
	return a.currentUser
}

// GetWorkspaces returns all workspaces
func (a *App) GetWorkspaces() ([]models.Workspace, error) {
	if a.apiClient == nil {
		return nil, fmt.Errorf("API client not initialized")
	}

	return a.apiClient.GetWorkspaces()
}

// GetCurrentWorkspace returns the active workspace
func (a *App) GetCurrentWorkspace() *models.Workspace {
	return a.currentWorkspace
}

// SearchIssues searches for issues
func (a *App) SearchIssues(query string) ([]models.Issue, error) {
	if a.apiClient == nil || a.currentWorkspace == nil {
		return nil, fmt.Errorf("not authenticated")
	}

	issues, err := a.apiClient.SearchIssues(a.currentWorkspace.Slug, query)
	if err != nil {
		return nil, err
	}

	return models.FilterOpenIssues(issues), nil
}

// GetMyIssues returns open work items assigned to the current user.
func (a *App) GetMyIssues() ([]models.Issue, error) {
	if a.apiClient == nil || a.currentWorkspace == nil || a.currentUser == nil {
		return nil, fmt.Errorf("not authenticated")
	}

	filters := models.IssueFilters{
		AssignedTo: a.currentUser.ID,
		Limit:      50,
	}

	issues, err := a.apiClient.GetMyIssues(a.currentWorkspace.Slug, filters)
	if err != nil {
		return nil, err
	}

	return models.FilterOpenIssues(issues), nil
}

// StartTracking starts tracking an issue by project and issue ID
func (a *App) StartTracking(projectID, issueID string) error {
	return a.StartTrackingIssue(models.Issue{
		ID:        issueID,
		ProjectID: projectID,
		Name:      fmt.Sprintf("Issue %s", issueID),
	})
}

// StartTrackingIssue starts tracking a selected issue with full metadata
func (a *App) StartTrackingIssue(issue models.Issue) error {
	return a.startTrackingForIssue(&issue)
}

// StopTracking stops the current tracking
func (a *App) StopTracking() error {
	if !a.timerMgr.IsActive() {
		return fmt.Errorf("no active tracking")
	}

	state := a.timerMgr.GetState()

	// Stop on backend
	if a.apiClient != nil && a.currentWorkspace != nil {
		err := a.apiClient.StopTimeTracking(
			a.currentWorkspace.Slug,
			state.ProjectID,
			state.IssueID,
			state.WorklogID,
		)
		if err != nil {
			return err
		}
	}

	// Stop locally
	a.timerMgr.Stop()

	return nil
}
