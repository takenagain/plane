# Plane Desktop Application - Requirements

## Overview
The Plane Desktop Application is a cross-platform desktop client for the Plane project management tool, built using Wails (Go + Svelte). It provides seamless access to Plane functionality with enhanced features like system tray time tracking.

## Functional Requirements

### FR1: Configuration Management
- **FR1.1**: The application shall allow users to configure the Plane instance URL
  - Default URL: `https://plan.francoisvw.com`
  - Configuration should persist across application restarts
  - Users should be able to modify the URL in settings

### FR2: Web View Integration
- **FR2.1**: The application shall embed the configured Plane website as a webview
- **FR2.2**: The webview shall act as a passthrough to the Plane website, preserving all functionality
- **FR2.3**: User authentication and session cookies from the webview shall be accessible to the application
- **FR2.4**: The application shall maintain user login state between sessions
- **FR2.5**: Navigation within the Plane interface shall work seamlessly

### FR3: API Integration
- **FR3.1**: The application shall extract and utilize authentication cookies from the webview
- **FR3.2**: The application shall make direct API calls to the Plane backend using extracted cookies
- **FR3.3**: API integration shall support the following endpoints:
  - Time tracking start/stop endpoints
  - Work item retrieval endpoints
  - User profile endpoints
  - Workspace/project listing endpoints

### FR4: Time Tracking Functionality
- **FR4.1**: The application shall display active time tracking in the system tray (Windows/Linux) or menu bar (macOS)
- **FR4.2**: The timer display shall update in real-time showing elapsed time in HH:MM:SS format
- **FR4.3**: The application shall provide a context menu in the system tray with the following options:
  - Stop current tracking
  - Start tracking on a new task (with task selection)
  - Pause/resume tracking (if supported by API)
  - Open main window
  - Quit application
- **FR4.4**: The application shall sync time tracking state with the Plane backend
- **FR4.5**: Multiple instances of time tracking shall not be allowed (enforced by backend)

### FR5: Work Item Management
- **FR5.1**: The application shall retrieve and cache user's work items
- **FR5.2**: Work items shall be categorized by:
  - Assigned to user
  - Recently accessed
  - Starred/favorited
  - Current project/cycle
- **FR5.3**: Work item search shall be available from the system tray menu
- **FR5.4**: Quick access to work items shall be provided for starting time tracking

### FR6: User Experience
- **FR6.1**: The application shall minimize to system tray instead of taskbar when closed
- **FR6.2**: The application shall start minimized to tray if configured
- **FR6.3**: Desktop notifications shall be shown for:
  - Time tracking started
  - Time tracking stopped
  - Long-running tracking sessions (configurable threshold)
- **FR6.4**: The application shall have a native look and feel on each platform
- **FR6.5**: Keyboard shortcuts shall be provided for common actions

## User Stories

### US1: Initial Setup
**As a** new user
**I want to** configure my Plane instance URL
**So that** I can connect the desktop app to my organization's Plane instance

**Acceptance Criteria:**
- On first launch, a setup wizard appears
- User can enter custom Plane URL or use default
- URL validation occurs before proceeding
- Configuration is saved for future sessions

### US2: Login and Authentication
**As a** Plane user
**I want to** log in through the desktop app
**So that** I can access my Plane workspace securely

**Acceptance Criteria:**
- Login page loads from configured Plane instance
- All authentication methods (email, SSO) work as expected
- Session cookies are captured and stored securely
- User remains logged in between app restarts

### US3: Quick Time Tracking
**As a** developer working on tasks
**I want to** quickly start/stop time tracking from the system tray
**So that** I don't need to open the full application or browser

**Acceptance Criteria:**
- System tray icon shows when time tracking is active
- Current timer displays in real-time
- Context menu allows stopping current tracking
- Context menu allows starting new tracking with task selection
- Notifications confirm tracking start/stop

### US4: Ambient Time Tracking Awareness
**As a** user tracking time on a task
**I want to** see the running timer at all times
**So that** I'm aware of how long I've been working and don't forget to stop

**Acceptance Criteria:**
- Timer visible in system tray/menu bar
- Timer updates every second
- Timer persists across window minimize/maximize
- Timer state syncs with web interface

### US5: Task Selection for Tracking
**As a** user starting time tracking
**I want to** easily select which task to track
**So that** I can quickly start tracking without opening the full interface

**Acceptance Criteria:**
- Recent tasks are shown in context menu
- Search functionality for finding tasks
- Task details (project, title) are displayed
- Selected task starts tracking immediately

### US6: Background Operation
**As a** user
**I want to** minimize the app to system tray
**So that** it doesn't clutter my taskbar while still tracking time

**Acceptance Criteria:**
- Closing window minimizes to tray instead of quitting
- Tray icon indicates app status
- Double-click tray icon reopens window
- Right-click shows context menu

### US7: Multi-Platform Support
**As a** team member using different operating systems
**I want to** use the same desktop app on Windows, macOS, and Linux
**So that** I have a consistent experience regardless of platform

**Acceptance Criteria:**
- Application builds and runs on Windows, macOS, and Linux
- System tray integration works on all platforms
- UI adapts to platform conventions
- Feature parity across platforms

## Non-Functional Requirements

### NFR1: Performance
- Application startup time shall be under 3 seconds
- API calls shall timeout after 30 seconds
- UI interactions shall respond within 100ms
- Memory usage shall not exceed 200MB during normal operation

### NFR2: Security
- Authentication cookies shall be stored securely using OS credential manager
- HTTPS shall be enforced for all API communications
- No sensitive data shall be logged to disk
- Cookie storage shall be encrypted at rest

### NFR3: Reliability
- Application shall handle network disconnections gracefully
- Time tracking state shall not be lost on application crash
- Automatic reconnection shall occur when network is restored
- Failed API calls shall be retried with exponential backoff

### NFR4: Usability
- First-time setup shall take less than 2 minutes
- Common actions shall be accessible within 2 clicks
- Error messages shall be clear and actionable
- Help documentation shall be accessible from the app

### NFR5: Maintainability
- Code shall follow Go and Svelte best practices
- All API interactions shall be abstracted in a service layer
- Frontend and backend shall communicate via well-defined interfaces
- Comprehensive logging shall be implemented for debugging

## Technical Constraints

- **TC1**: Must use Wails v2 framework
- **TC2**: Backend must be written in Go
- **TC3**: Frontend must be written in Svelte
- **TC4**: Must support Windows 10+, macOS 11+, and Linux (modern distributions)
- **TC5**: Must work with existing Plane API without modifications
- **TC6**: Must handle Plane API authentication using HTTP cookies

## Dependencies

- Wails v2.x framework
- Go 1.21 or higher
- Node.js and npm for frontend build
- Svelte framework
- Plane API (existing)

## Out of Scope

The following features are explicitly out of scope for the initial release:

- Offline mode with full functionality
- Mobile applications (iOS/Android)
- Plugin/extension system
- Custom themes beyond system theme support
- Advanced reporting features not available in web interface
- Multi-account support
- Automated time tracking based on application usage
