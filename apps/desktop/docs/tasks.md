# Plane Desktop Application - Task List

## Status Legend
- ⬜ Not Started
- 🔄 In Progress
- ✅ Complete
- ⏸️ Blocked
- ⏭️ Deferred

---

## Phase 1: Project Setup and Foundation

### 1.1 Project Initialization ✅
- ✅ Install Wails CLI
- ✅ Create Wails project with Svelte template
- ✅ Move project to apps/desktop directory
- ✅ Create documentation structure

### 1.2 Documentation ✅
- ✅ Create requirements.md with functional requirements and user stories
- ✅ Create design.md with architecture, diagrams, and component design
- ✅ Create tasks.md for task tracking

### 1.3 Project Structure Setup ⬜
- ⬜ Set up Go module structure
  - ⬜ Create pkg/ directory for reusable packages
  - ⬜ Create internal/ directory for private code
  - ⬜ Create cmd/ directory for CLI utilities
- ⬜ Set up frontend structure
  - ⬜ Organize Svelte components directory
  - ⬜ Create stores directory for state management
  - ⬜ Create services directory for API clients
  - ⬜ Create utils directory for helpers
- ⬜ Create build configuration
  - ⬜ Configure wails.json for different platforms
  - ⬜ Set up build scripts
  - ⬜ Create .gitignore entries

### 1.4 Development Environment ⬜
- ⬜ Set up hot reload for development
- ⬜ Configure logging (development and production)
- ⬜ Set up debugging tools
- ⬜ Create development documentation (README.md)

---

## Phase 2: Core Backend Components

### 2.1 Configuration Manager ⬜
- ⬜ Define Config struct
  - ⬜ PlaneURL field
  - ⬜ User preferences fields
  - ⬜ Notification settings
- ⬜ Implement LoadConfig() function
  - ⬜ Determine config file location per platform
  - ⬜ Read config file
  - ⬜ Parse JSON
  - ⬜ Apply defaults for missing fields
- ⬜ Implement SaveConfig() function
  - ⬜ Serialize config to JSON
  - ⬜ Create config directory if needed
  - ⬜ Write file atomically
- ⬜ Implement GetConfigPath() helper
- ⬜ Add validation for config values
- ⬜ Write unit tests for configuration manager

### 2.2 Cookie Manager ⬜
- ⬜ Define CookieStore struct
- ⬜ Implement ExtractFromWebview()
  - ⬜ Research Wails webview cookie access
  - ⬜ Extract cookies from webview
  - ⬜ Filter Plane-related cookies
  - ⬜ Parse cookie attributes
- ⬜ Implement secure storage
  - ⬜ Windows: Use DPAPI wrapper
  - ⬜ macOS: Use Keychain wrapper
  - ⬜ Linux: Use Secret Service API
  - ⬜ Implement SaveSecurely()
  - ⬜ Implement LoadSecurely()
- ⬜ Implement GetCookiesForRequest()
  - ⬜ Format cookies for HTTP requests
  - ⬜ Check cookie expiration
  - ⬜ Handle cookie domains
- ⬜ Implement IsValid() checker
- ⬜ Implement cookie refresh mechanism
- ⬜ Write unit tests for cookie manager

### 2.3 API Client ⬜
- ⬜ Define PlaneAPI struct
- ⬜ Create HTTP client with proper configuration
  - ⬜ Set timeouts
  - ⬜ Configure TLS
  - ⬜ Add user agent
- ⬜ Implement cookie injection for requests
- ⬜ Implement request/response logging
- ⬜ Implement error handling and retry logic
  - ⬜ Define error types
  - ⬜ Implement exponential backoff
  - ⬜ Handle rate limiting
- ⬜ Implement Time Tracking endpoints
  - ⬜ StartTimeTracking()
  - ⬜ StopTimeTracking()
  - ⬜ GetActiveTimeTracking()
  - ⬜ GetWorklogHistory()
- ⬜ Implement Work Item endpoints
  - ⬜ GetMyIssues()
  - ⬜ GetIssue()
  - ⬜ SearchIssues()
- ⬜ Implement User & Workspace endpoints
  - ⬜ GetCurrentUser()
  - ⬜ GetWorkspaces()
  - ⬜ GetProjects()
- ⬜ Define data models (structs)
  - ⬜ WorkLog struct
  - ⬜ Issue struct
  - ⬜ User struct
  - ⬜ Workspace struct
  - ⬜ Project struct
- ⬜ Write unit tests with mocked HTTP responses
- ⬜ Write integration tests against test Plane instance

### 2.4 Timer Manager ⬜
- ⬜ Define TimerState struct
- ⬜ Implement Start() method
  - ⬜ Initialize timer state
  - ⬜ Start ticker
  - ⬜ Emit initial event
- ⬜ Implement Stop() method
  - ⬜ Stop ticker
  - ⬜ Calculate final duration
  - ⬜ Clear state
  - ⬜ Emit stop event
- ⬜ Implement Tick() method
  - ⬜ Increment elapsed time
  - ⬜ Emit tick event
  - ⬜ Update system tray
- ⬜ Implement GetElapsed() helper
- ⬜ Implement state persistence
  - ⬜ SaveState() to disk
  - ⬜ LoadState() on startup
  - ⬜ Auto-save every minute
- ⬜ Implement SyncWithBackend()
  - ⬜ Fetch current worklog from API
  - ⬜ Compare with local state
  - ⬜ Resolve conflicts
- ⬜ Add event emitter for timer updates
- ⬜ Write unit tests for timer logic

### 2.5 System Tray Manager ⬜
- ⬜ Research system tray libraries for Wails/Go
  - ⬜ Evaluate options (systray, getlantern/systray, etc.)
  - ⬜ Choose and integrate library
- ⬜ Implement SetupTray()
  - ⬜ Create tray icon
  - ⬜ Set default icon
  - ⬜ Initialize menu
- ⬜ Implement UpdateIcon()
  - ⬜ Load icon assets
  - ⬜ Switch between idle/tracking/error icons
  - ⬜ Handle platform-specific differences
- ⬜ Implement BuildMenu()
  - ⬜ Create menu structure
  - ⬜ Add menu items
  - ⬜ Set menu item callbacks
- ⬜ Implement UpdateMenu()
  - ⬜ Update timer display in menu
  - ⬜ Update issue list
  - ⬜ Enable/disable items based on state
- ⬜ Implement menu item handlers
  - ⬜ OnStopTracking()
  - ⬜ OnStartTracking()
  - ⬜ OnSearchIssues()
  - ⬜ OnShowWindow()
  - ⬜ OnSettings()
  - ⬜ OnQuit()
- ⬜ Implement recent issues submenu
  - ⬜ Fetch recent issues
  - ⬜ Build dynamic submenu
  - ⬜ Handle issue selection
- ⬜ Add platform-specific customizations
  - ⬜ macOS menu bar styling
  - ⬜ Windows notification area behavior
  - ⬜ Linux system tray integration
- ⬜ Write unit tests for menu logic

---

## Phase 3: Frontend Components

### 3.1 Frontend Setup ⬜
- ⬜ Set up Svelte stores
  - ⬜ Create appStore for global state
  - ⬜ Create configStore for settings
  - ⬜ Create timerStore for timer state
  - ⬜ Create issuesStore for work items
- ⬜ Set up Wails runtime bindings
  - ⬜ Import generated bindings
  - ⬜ Create service wrappers
- ⬜ Set up routing (if needed for settings)
- ⬜ Create common UI components
  - ⬜ Button component
  - ⬜ Input component
  - ⬜ Modal component
  - ⬜ Loader component

### 3.2 Main Window / Webview ⬜
- ⬜ Implement webview container component
  - ⬜ Create iframe or use Wails webview
  - ⬜ Load configured Plane URL
  - ⬜ Handle navigation events
- ⬜ Implement webview-backend bridge
  - ⬜ Trigger cookie extraction on login
  - ⬜ Listen for authentication events
  - ⬜ Sync state with backend
- ⬜ Add loading state
- ⬜ Add error state (connection failed, etc.)
- ⬜ Implement window controls
  - ⬜ Minimize to tray
  - ⬜ Close to tray (don't quit)
  - ⬜ Restore from tray

### 3.3 Settings Dialog ⬜
- ⬜ Create Settings.svelte component
- ⬜ Implement General tab
  - ⬜ Plane URL input
  - ⬜ Startup options checkboxes
  - ⬜ Save/Cancel buttons
- ⬜ Implement Notifications tab
  - ⬜ Notification toggles
  - ⬜ Sound settings
  - ⬜ Alert threshold input
- ⬜ Implement Time Tracking tab
  - ⬜ Default workspace selector
  - ⬜ Sync interval input
  - ⬜ Auto-start options
- ⬜ Implement About tab
  - ⬜ Display version
  - ⬜ Check for updates button
  - ⬜ License and links
- ⬜ Connect settings to backend
  - ⬜ Load config on open
  - ⬜ Save config on submit
  - ⬜ Validate inputs
- ⬜ Add keyboard shortcuts
- ⬜ Style with Plane design system (if applicable)

### 3.4 Issue Selection Component ⬜
- ⬜ Create IssueSelector.svelte
- ⬜ Implement issue list view
  - ⬜ Display issue ID, title, project
  - ⬜ Show issue status indicator
  - ⬜ Implement click to select
- ⬜ Implement search input
  - ⬜ Debounced search
  - ⬜ Show search results
  - ⬜ Clear search button
- ⬜ Implement filtering
  - ⬜ Filter by project
  - ⬜ Filter by status
  - ⬜ Show only assigned to me
- ⬜ Implement loading states
- ⬜ Implement empty states
- ⬜ Add keyboard navigation
  - ⬜ Arrow keys to navigate
  - ⬜ Enter to select
  - ⬜ Escape to cancel

### 3.5 Timer Display Component ⬜
- ⬜ Create TimerDisplay.svelte
- ⬜ Display formatted time (HH:MM:SS)
- ⬜ Show current issue info
  - ⬜ Issue ID and title
  - ⬜ Project name
- ⬜ Subscribe to timer updates from backend
- ⬜ Implement visual states
  - ⬜ Active (tracking)
  - ⬜ Paused (if supported)
  - ⬜ Idle (not tracking)
- ⬜ Add controls
  - ⬜ Stop button
  - ⬜ Open issue button

---

## Phase 4: Integration and Features

### 4.1 Webview Cookie Extraction ⬜
- ⬜ Research Wails webview cookie APIs
- ⬜ Implement JavaScript injection for cookie reading (if needed)
- ⬜ Implement Go callback for cookie extraction
- ⬜ Test cookie extraction on login
- ⬜ Handle cookie refresh on session extension
- ⬜ Handle logout (clear cookies)

### 4.2 Authentication Flow ⬜
- ⬜ Implement initial authentication
  - ⬜ Show webview on first launch
  - ⬜ Wait for successful login
  - ⬜ Extract and save cookies
  - ⬜ Validate cookies with API test call
- ⬜ Implement session restoration
  - ⬜ Load cookies on startup
  - ⬜ Test cookie validity
  - ⬜ Show main UI if valid
  - ⬜ Show login if invalid
- ⬜ Implement re-authentication
  - ⬜ Detect expired cookies
  - ⬜ Prompt user to re-login
  - ⬜ Re-extract cookies
- ⬜ Implement logout
  - ⬜ Clear cookies from storage
  - ⬜ Clear cache
  - ⬜ Show login screen

### 4.3 Time Tracking Integration ⬜
- ⬜ Implement start tracking flow
  - ⬜ User selects issue from tray
  - ⬜ Call API to start tracking
  - ⬜ Start local timer
  - ⬜ Update tray icon and menu
  - ⬜ Show notification
- ⬜ Implement stop tracking flow
  - ⬜ User clicks stop from tray
  - ⬜ Calculate duration
  - ⬜ Call API to stop tracking
  - ⬜ Stop local timer
  - ⬜ Update tray icon and menu
  - ⬜ Show notification with duration
- ⬜ Implement timer display in tray
  - ⬜ Format elapsed time
  - ⬜ Update every second
  - ⬜ Show issue info
- ⬜ Implement sync mechanism
  - ⬜ Periodically check active worklog
  - ⬜ Update local timer if changed
  - ⬜ Resolve conflicts

### 4.4 Issue Search and Caching ⬜
- ⬜ Implement issue cache
  - ⬜ Define cache structure
  - ⬜ Implement cache expiration
  - ⬜ Implement cache refresh
- ⬜ Fetch recent issues on startup
  - ⬜ Call GetMyIssues API
  - ⬜ Store in cache
  - ⬜ Populate tray menu
- ⬜ Implement search functionality
  - ⬜ Accept search input from tray
  - ⬜ Call SearchIssues API
  - ⬜ Display results
  - ⬜ Handle no results
- ⬜ Implement issue selection
  - ⬜ User picks issue from list
  - ⬜ Start tracking selected issue

### 4.5 Notifications ⬜
- ⬜ Research notification libraries for Wails/Go
  - ⬜ Evaluate options (beeep, toast, etc.)
  - ⬜ Choose and integrate library
- ⬜ Implement ShowNotification()
  - ⬜ Set notification title
  - ⬜ Set notification body
  - ⬜ Set notification icon
  - ⬜ Handle platform differences
- ⬜ Implement notification triggers
  - ⬜ Tracking started
  - ⬜ Tracking stopped
  - ⬜ Long-running session alert
  - ⬜ Connection error
  - ⬜ Update available
- ⬜ Respect user notification preferences
- ⬜ Add notification sound (optional)

### 4.6 Error Handling and Resilience ⬜
- ⬜ Implement network error handling
  - ⬜ Detect offline state
  - ⬜ Queue operations for retry
  - ⬜ Show offline indicator
  - ⬜ Auto-reconnect when online
- ⬜ Implement API error handling
  - ⬜ Parse error responses
  - ⬜ Show user-friendly messages
  - ⬜ Log errors for debugging
- ⬜ Implement timer recovery
  - ⬜ Save timer state periodically
  - ⬜ Restore on crash/restart
  - ⬜ Sync with backend on restore
- ⬜ Implement graceful degradation
  - ⬜ Show cached data when offline
  - ⬜ Disable features requiring API
  - ⬜ Restore when connection available

---

## Phase 5: Polish and Testing

### 5.1 UI/UX Polish ⬜
- ⬜ Design and create app icons
  - ⬜ Main application icon (all sizes)
  - ⬜ System tray icon (idle)
  - ⬜ System tray icon (tracking)
  - ⬜ System tray icon (error)
- ⬜ Implement loading states everywhere
- ⬜ Implement error states everywhere
- ⬜ Add smooth transitions and animations
- ⬜ Improve accessibility
  - ⬜ Keyboard navigation
  - ⬜ Screen reader support
  - ⬜ High contrast support
- ⬜ Responsive design for different window sizes
- ⬜ Platform-specific UI adjustments

### 5.2 Performance Optimization ⬜
- ⬜ Profile application startup time
  - ⬜ Identify bottlenecks
  - ⬜ Optimize slow paths
  - ⬜ Lazy load when possible
- ⬜ Profile memory usage
  - ⬜ Fix memory leaks
  - ⬜ Optimize cache size
  - ⬜ Implement cache eviction
- ⬜ Optimize API calls
  - ⬜ Batch requests where possible
  - ⬜ Implement request deduplication
  - ⬜ Optimize polling intervals
- ⬜ Optimize webview performance
  - ⬜ Disable unused features
  - ⬜ Optimize memory usage

### 5.3 Testing ⬜
- ⬜ Write unit tests for Go backend
  - ⬜ Configuration manager tests
  - ⬜ Cookie manager tests
  - ⬜ API client tests
  - ⬜ Timer manager tests
  - ⬜ Tray manager tests
- ⬜ Write integration tests
  - ⬜ End-to-end authentication flow
  - ⬜ Time tracking flow
  - ⬜ Issue search and selection
  - ⬜ State persistence
- ⬜ Manual testing on platforms
  - ⬜ Windows 10
  - ⬜ Windows 11
  - ⬜ macOS 11 (Big Sur)
  - ⬜ macOS 12 (Monterey)
  - ⬜ macOS 13+ (Ventura/Sonoma)
  - ⬜ Ubuntu 22.04
  - ⬜ Fedora 38
  - ⬜ Other Linux distros (optional)
- ⬜ Test edge cases
  - ⬜ Network disconnection during tracking
  - ⬜ Application crash during tracking
  - ⬜ Cookie expiration
  - ⬜ Invalid Plane URL
  - ⬜ API errors
- ⬜ Test system tray on all platforms
- ⬜ Test notifications on all platforms

### 5.4 Documentation ⬜
- ⬜ Write user documentation
  - ⬜ Installation guide
  - ⬜ Quick start guide
  - ⬜ Features overview
  - ⬜ Settings explanation
  - ⬜ Troubleshooting
  - ⬜ FAQ
- ⬜ Write developer documentation
  - ⬜ Setup development environment
  - ⬜ Build instructions
  - ⬜ Architecture overview
  - ⬜ Contributing guide
  - ⬜ Code style guide
- ⬜ Update README.md
  - ⬜ Add screenshots
  - ⬜ Add feature list
  - ⬜ Add build/install instructions
  - ⬜ Add badges (build status, version, etc.)

### 5.5 Build and Release ⬜
- ⬜ Set up build pipeline
  - ⬜ Configure GitHub Actions (or CI of choice)
  - ⬜ Build for Windows
  - ⬜ Build for macOS (Intel + Apple Silicon)
  - ⬜ Build for Linux
- ⬜ Create installers
  - ⬜ Windows MSI installer
  - ⬜ Windows portable exe
  - ⬜ macOS DMG
  - ⬜ Linux AppImage
  - ⬜ Linux .deb package
  - ⬜ Linux .rpm package
- ⬜ Set up code signing
  - ⬜ Windows code signing
  - ⬜ macOS code signing and notarization
- ⬜ Create release notes
- ⬜ Tag release version
- ⬜ Publish release artifacts

---

## Phase 6: Advanced Features (Optional/Future)

### 6.1 Keyboard Shortcuts ⏭️
- ⏭️ Define shortcut scheme
- ⏭️ Implement global hotkeys
  - ⏭️ Quick start/stop tracking
  - ⏭️ Show window
  - ⏭️ Search issues
- ⏭️ Make shortcuts configurable
- ⏭️ Add shortcuts help screen

### 6.2 Statistics and Reporting ⏭️
- ⏭️ Show daily/weekly time summary
- ⏭️ Show time per project
- ⏭️ Show time per issue
- ⏭️ Export time logs to CSV
- ⏭️ Create simple charts/visualizations

### 6.3 Auto-Update ⏭️
- ⏭️ Implement update checker
- ⏭️ Download updates
- ⏭️ Verify update signatures
- ⏭️ Install updates
- ⏭️ Notify user of available updates

### 6.4 Offline Support ⏭️
- ⏭️ Implement local database for offline data
- ⏭️ Queue API operations when offline
- ⏭️ Sync queued operations when online
- ⏭️ Conflict resolution for synced data

### 6.5 Advanced Notifications ⏭️
- ⏭️ Customizable notification templates
- ⏭️ Rich notifications with actions
- ⏭️ Notification history
- ⏭️ Do not disturb mode

---

## Commit and PR Milestones

### Milestone 1: Foundation ⬜
- ⬜ Complete Phase 1 (Project Setup)
- ⬜ Complete Phase 2.1-2.2 (Config and Cookie managers)
- ⬜ **Commit**: "feat(desktop): initialize Wails project with config and cookie management"
- ⬜ **Push to remote**

### Milestone 2: API Integration ⬜
- ⬜ Complete Phase 2.3 (API Client)
- ⬜ Complete Phase 2.4 (Timer Manager)
- ⬜ **Commit**: "feat(desktop): implement Plane API client and timer manager"
- ⬜ **Push to remote**

### Milestone 3: System Integration ⬜
- ⬜ Complete Phase 2.5 (System Tray)
- ⬜ Complete Phase 4.5 (Notifications)
- ⬜ **Commit**: "feat(desktop): add system tray integration and notifications"
- ⬜ **Push to remote**

### Milestone 4: Frontend ⬜
- ⬜ Complete Phase 3 (Frontend Components)
- ⬜ Complete Phase 4.1-4.2 (Webview and Auth)
- ⬜ **Commit**: "feat(desktop): implement frontend UI and authentication flow"
- ⬜ **Push to remote**

### Milestone 5: Core Features ⬜
- ⬜ Complete Phase 4.3-4.4 (Time Tracking and Issue Search)
- ⬜ Complete Phase 4.6 (Error Handling)
- ⬜ **Commit**: "feat(desktop): complete time tracking and issue search features"
- ⬜ **Push to remote**

### Milestone 6: Polish and Testing ⬜
- ⬜ Complete Phase 5.1-5.3 (Polish, Optimization, Testing)
- ⬜ **Commit**: "feat(desktop): UI polish, performance optimization, and testing"
- ⬜ **Push to remote**

### Milestone 7: Documentation and Release ⬜
- ⬜ Complete Phase 5.4-5.5 (Documentation and Build)
- ⬜ **Commit**: "feat(desktop): add documentation and release builds"
- ⬜ **Push to remote**
- ⬜ **Create PR**: "feat: Add Plane Desktop Application (Wails + Go + Svelte)"
  - Target branch: staging
  - Include all documentation
  - Add screenshots
  - List all features
  - Provide build/test instructions

---

## Notes

- This is a living document and will be updated as work progresses
- Some tasks may be reordered based on dependencies and priorities
- New tasks may be added as requirements evolve
- Completed tasks will be marked with ✅
- Tasks may be split into subtasks as needed for clarity

## Current Focus

**Phase**: 1 - Project Setup and Foundation
**Current Task**: 1.2 Documentation ✅
**Next Task**: 1.3 Project Structure Setup
