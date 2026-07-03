package main

import (
	"fmt"
	"log"
	"net/http"
	"sync"

	"github.com/takenagain/plane/apps/desktop/internal/cookie"
	"github.com/wailsapp/wails/v2/pkg/runtime"
)

const (
	eventAuthStateChanged = "auth:state-changed"
	eventAuthLoginURL     = "auth:login-url"
)

// AuthState represents the current authentication status for the UI.
type AuthState struct {
	Status    string `json:"status"`
	LoginURL  string `json:"login_url"`
	PlaneURL  string `json:"plane_url"`
	UserEmail string `json:"user_email,omitempty"`
}

const (
	authStatusAuthenticated  = "authenticated"
	authStatusLoginRequired  = "login_required"
	authStatusAuthenticating = "authenticating"
)

type authController struct {
	mu         sync.Mutex
	status     string
	loginProxy *cookie.LoginProxy
	loginURL   string
}

func (a *App) initAuthController() {
	if a.apiClient != nil {
		a.apiClient.SetAuthErrorHandler(a.handleAuthFailure)
	}
}

func (a *App) bootstrapAuth() {
	a.initAuthController()

	if a.cookieMgr.IsValid() && a.cookieMgr.HasSessionCookies() {
		if err := a.authenticate(); err != nil {
			log.Printf("Stored session invalid: %v", err)
			if clearErr := a.cookieMgr.Clear(); clearErr != nil {
				log.Printf("Failed to clear stale cookies: %v", clearErr)
			}
			a.requireLogin()
			return
		}

		a.setAuthenticated()
		return
	}

	a.requireLogin()
}

func (a *App) requireLogin() {
	a.auth.status = authStatusLoginRequired
	a.currentUser = nil
	a.currentWorkspace = nil

	if a.trayMgr != nil {
		a.trayMgr.SetAuthenticated(false)
	}

	if err := a.ensureLoginProxy(); err != nil {
		log.Printf("Failed to start login proxy: %v", err)
	}

	a.emitAuthState()
	runtime.WindowShow(a.ctx)
}

func (a *App) setAuthenticated() {
	a.auth.status = authStatusAuthenticated

	if a.trayMgr != nil {
		a.trayMgr.SetAuthenticated(true)
	}

	if a.cookieMgr != nil {
		if err := a.cookieMgr.SaveSecurely(); err != nil {
			log.Printf("Failed to persist session cookies: %v", err)
		}
	}

	if err := a.ensureLoginProxy(); err != nil {
		log.Printf("Failed to start app proxy: %v", err)
	}

	a.emitAuthState()
}

func (a *App) handleAuthFailure() {
	if a.cookieMgr == nil {
		return
	}

	// Do not wipe cookies while the login webview is still probing — partial
	// captures (e.g. csrftoken before session-id) would otherwise be erased on 401.
	if a.auth.status != authStatusAuthenticated {
		return
	}

	if err := a.cookieMgr.Clear(); err != nil {
		log.Printf("Failed to clear cookies: %v", err)
	}

	a.requireLogin()
}

func (a *App) ensureLoginProxy() error {
	a.auth.mu.Lock()
	defer a.auth.mu.Unlock()

	if a.auth.loginProxy != nil {
		return nil
	}

	planeURL := a.configMgr.Get().PlaneURL
	proxy, err := cookie.NewLoginProxy(planeURL, func(cookies []*http.Cookie) {
		if err := a.cookieMgr.ExtractFromWebview(planeURL, cookies); err != nil {
			log.Printf("Failed to store webview cookies: %v", err)
			return
		}

		if a.auth.status == authStatusAuthenticated || !a.cookieMgr.HasSessionCookies() {
			return
		}

		go func() {
			if err := a.TryAuthenticateFromWebview(); err != nil {
				log.Printf("Login probe failed: %v", err)
			}
		}()
	})
	if err != nil {
		return err
	}

	loginURL, err := proxy.Start()
	if err != nil {
		return err
	}

	proxy.SetRequestCookieInjector(func(req *http.Request) {
		if a.cookieMgr == nil || a.configMgr == nil {
			return
		}

		planeURL := a.configMgr.Get().PlaneURL
		host, err := cookie.HostFromPlaneURL(planeURL)
		if err != nil || host == "" {
			return
		}

		cookie.MergeRequestCookies(req, a.cookieMgr.GetCookiesForRequest(host))
	})

	a.auth.loginProxy = proxy
	a.auth.loginURL = loginURL
	return nil
}

func (a *App) emitAuthState() {
	state := a.GetAuthState()
	runtime.EventsEmit(a.ctx, eventAuthStateChanged, state)
	if state.Status == authStatusLoginRequired && state.LoginURL != "" {
		runtime.EventsEmit(a.ctx, eventAuthLoginURL, state.LoginURL)
	}
}

// IsAuthenticated reports whether the app has a valid session.
func (a *App) IsAuthenticated() bool {
	return a.auth.status == authStatusAuthenticated && a.currentUser != nil
}

// OpenLogin shows the login webview panel.
func (a *App) OpenLogin() error {
	if a.ctx == nil {
		return fmt.Errorf("app not initialized")
	}

	a.requireLogin()
	return nil
}

// GetAuthState returns authentication state for the frontend shell.
func (a *App) GetAuthState() AuthState {
	planeURL := ""
	if a.configMgr != nil {
		planeURL = a.configMgr.Get().PlaneURL
	}

	state := AuthState{
		Status:   a.auth.status,
		LoginURL: a.auth.loginURL,
		PlaneURL: planeURL,
	}

	if a.currentUser != nil {
		state.UserEmail = a.currentUser.Email
		if state.UserEmail == "" {
			state.UserEmail = a.currentUser.DisplayName
		}
	}

	if state.Status == "" {
		state.Status = authStatusLoginRequired
	}

	if state.Status == authStatusLoginRequired && state.LoginURL == "" {
		state.LoginURL = planeURL
	}

	return state
}

// GetWebsiteURL returns the proxy root URL for the embedded Plane web UI.
func (a *App) GetWebsiteURL() string {
	if err := a.ensureLoginProxy(); err != nil {
		log.Printf("Failed to ensure app proxy: %v", err)
	}

	if a.auth.loginProxy != nil {
		return a.auth.loginProxy.URLWithSecret("/")
	}

	if a.configMgr != nil {
		return a.configMgr.Get().PlaneURL
	}

	return ""
}

// GetLoginURL returns the URL the login iframe should load.
func (a *App) GetLoginURL() string {
	if a.auth.loginProxy != nil {
		return a.auth.loginProxy.URLWithSecret("/sign-in/")
	}

	if a.configMgr != nil {
		return a.configMgr.Get().PlaneURL + "/sign-in/"
	}

	return ""
}

// TryAuthenticateFromWebview probes for a completed web login and finalizes the session.
func (a *App) TryAuthenticateFromWebview() error {
	if a.cookieMgr == nil || a.apiClient == nil {
		return fmt.Errorf("app not initialized")
	}

	if !a.cookieMgr.HasSessionCookies() {
		return fmt.Errorf("no session cookies captured yet")
	}

	a.auth.status = authStatusAuthenticating
	a.emitAuthState()

	if err := a.authenticate(); err != nil {
		a.auth.status = authStatusLoginRequired
		a.emitAuthState()
		return err
	}

	a.setAuthenticated()
	return nil
}

// SubmitWebviewCookies stores cookies provided by the frontend JS bridge.
func (a *App) SubmitWebviewCookies(cookieHeader string) error {
	if a.configMgr == nil || a.cookieMgr == nil {
		return fmt.Errorf("app not initialized")
	}

	cookies := cookie.ParseCookieHeader(cookieHeader)
	if len(cookies) == 0 {
		return fmt.Errorf("no cookies provided")
	}

	planeURL := a.configMgr.Get().PlaneURL
	if err := a.cookieMgr.ExtractFromWebview(planeURL, cookies); err != nil {
		return err
	}

	return a.TryAuthenticateFromWebview()
}
