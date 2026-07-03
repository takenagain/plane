package cookie

import (
	"crypto/rand"
	"crypto/subtle"
	"encoding/base64"
	"fmt"
	"net"
	"net/http"
	"net/http/httputil"
	"net/url"
	"strings"
	"sync"
)

const (
	// ProxySecretHeader must be sent on proxied requests that need stored session cookies.
	ProxySecretHeader = "X-Plane-Desktop-Proxy-Secret"
	// ProxySecretQuery is appended to iframe URLs; browsers cannot set custom headers on navigation.
	ProxySecretQuery = "plane_desktop_proxy_secret"
	// ProxySecretCookie is set by the proxy after a valid query-param bootstrap request.
	ProxySecretCookie = "plane_desktop_proxy_secret"
)

// LoginProxy reverse-proxies the Plane web UI so Set-Cookie headers can be captured
// for the Go API client while the user signs in through an embedded iframe.
type LoginProxy struct {
	target   *url.URL
	server   *http.Server
	listener net.Listener
	onCookies func([]*http.Cookie)
	injectRequestCookies func(*http.Request)

	mu            sync.Mutex
	started       bool
	sessionSecret string
}

// SetRequestCookieInjector merges stored session cookies into proxied requests
// when the browser iframe has not yet received them (e.g. after app restart).
func (p *LoginProxy) SetRequestCookieInjector(fn func(*http.Request)) {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.injectRequestCookies = fn
}

// NewLoginProxy creates a proxy for the given Plane instance URL.
func NewLoginProxy(planeURL string, onCookies func([]*http.Cookie)) (*LoginProxy, error) {
	target, err := url.Parse(strings.TrimSuffix(planeURL, "/"))
	if err != nil {
		return nil, fmt.Errorf("invalid plane url: %w", err)
	}

	if target.Scheme == "" || target.Host == "" {
		return nil, fmt.Errorf("plane url must include scheme and host")
	}

	return &LoginProxy{
		target:    target,
		onCookies: onCookies,
	}, nil
}

const loginProxyPort = "38472"

// Start listens on localhost and serves proxied Plane content.
func (p *LoginProxy) Start() (string, error) {
	p.mu.Lock()
	defer p.mu.Unlock()

	if p.started {
		return p.BaseURL(), nil
	}

	listener, err := net.Listen("tcp", "127.0.0.1:"+loginProxyPort)
	if err != nil {
		// Fall back to an ephemeral port if the preferred one is taken.
		listener, err = net.Listen("tcp", "127.0.0.1:0")
	}
	if err != nil {
		return "", fmt.Errorf("start login proxy: %w", err)
	}

	proxy := httputil.NewSingleHostReverseProxy(p.target)
	proxy.Director = p.director
	proxy.ModifyResponse = p.modifyResponse
	proxy.ErrorHandler = func(w http.ResponseWriter, r *http.Request, err error) {
		http.Error(w, "login proxy error", http.StatusBadGateway)
	}

	p.listener = listener
	p.server = &http.Server{Handler: proxy}
	p.started = true
	p.sessionSecret = generateProxySecret()

	go func() {
		_ = p.server.Serve(listener)
	}()

	return p.BaseURL(), nil
}

// Stop shuts down the proxy server.
func (p *LoginProxy) Stop() error {
	p.mu.Lock()
	defer p.mu.Unlock()

	if !p.started {
		return nil
	}

	p.started = false

	if p.server != nil {
		err := p.server.Close()
		p.server = nil
		p.listener = nil
		return err
	}

	return nil
}

// BaseURL returns the proxy root URL.
func (p *LoginProxy) BaseURL() string {
	if p.listener == nil {
		return ""
	}

	return "http://" + p.listener.Addr().String()
}

// URLWithSecret returns a proxy URL with the per-session secret query parameter.
func (p *LoginProxy) URLWithSecret(path string) string {
	base := strings.TrimSuffix(p.BaseURL(), "/")
	if base == "" || p.sessionSecret == "" {
		return base + path
	}

	parsed, err := url.Parse(base + path)
	if err != nil {
		return base + path
	}

	query := parsed.Query()
	query.Set(ProxySecretQuery, p.sessionSecret)
	parsed.RawQuery = query.Encode()
	return parsed.String()
}

func generateProxySecret() string {
	buf := make([]byte, 32)
	if _, err := rand.Read(buf); err != nil {
		panic(fmt.Sprintf("generate proxy secret: %v", err))
	}
	return base64.RawURLEncoding.EncodeToString(buf)
}

func (p *LoginProxy) validateProxySecret(req *http.Request) bool {
	if req == nil || p.sessionSecret == "" {
		return false
	}

	expected := []byte(p.sessionSecret)

	if header := req.Header.Get(ProxySecretHeader); header != "" {
		return subtle.ConstantTimeCompare([]byte(header), expected) == 1
	}

	if query := req.URL.Query().Get(ProxySecretQuery); query != "" {
		return subtle.ConstantTimeCompare([]byte(query), expected) == 1
	}

	for _, cookie := range req.Cookies() {
		if cookie.Name == ProxySecretCookie {
			return subtle.ConstantTimeCompare([]byte(cookie.Value), expected) == 1
		}
	}

	return false
}

func (p *LoginProxy) director(req *http.Request) {
	target := p.target
	req.URL.Scheme = target.Scheme
	req.URL.Host = target.Host
	req.Host = target.Host

	if origin := req.Header.Get("Origin"); origin != "" {
		req.Header.Set("Origin", target.Scheme+"://"+target.Host)
	}

	if referer := req.Header.Get("Referer"); referer != "" {
		if parsed, err := url.Parse(referer); err == nil {
			parsed.Scheme = target.Scheme
			parsed.Host = target.Host
			req.Header.Set("Referer", parsed.String())
		}
	}

	if req.Header.Get("X-Forwarded-Host") == "" {
		req.Header.Set("X-Forwarded-Host", target.Host)
	}

	if p.injectRequestCookies != nil && p.validateProxySecret(req) {
		p.injectRequestCookies(req)
	}
}

// MergeRequestCookies adds cookies to req when the client did not send them.
func MergeRequestCookies(req *http.Request, cookies []*http.Cookie) {
	if req == nil || len(cookies) == 0 {
		return
	}

	existing := make(map[string]struct{}, len(req.Cookies()))
	for _, cookie := range req.Cookies() {
		existing[cookie.Name] = struct{}{}
	}

	for _, cookie := range cookies {
		if _, ok := existing[cookie.Name]; !ok {
			req.AddCookie(cookie)
		}
	}
}

func (p *LoginProxy) modifyResponse(resp *http.Response) error {
	if resp == nil {
		return nil
	}

	if resp.Request != nil && p.validateProxySecret(resp.Request) {
		proxyCookie := &http.Cookie{
			Name:     ProxySecretCookie,
			Value:    p.sessionSecret,
			Path:     "/",
			HttpOnly: true,
			SameSite: http.SameSiteStrictMode,
		}
		resp.Header.Add("Set-Cookie", proxyCookie.String())
	}

	// Plane sends X-Frame-Options: DENY; strip frame-blocking headers so the
	// sign-in page can render inside the desktop app's iframe via this proxy.
	resp.Header.Del("X-Frame-Options")
	resp.Header.Del("Content-Security-Policy")
	resp.Header.Del("Content-Security-Policy-Report-Only")

	if loc := resp.Header.Get("Location"); loc != "" {
		if rewritten := p.rewriteToProxy(loc); rewritten != loc {
			resp.Header.Set("Location", rewritten)
		}
	}

	cookies := rewriteProxySetCookies(resp)
	if p.onCookies != nil && len(cookies) > 0 {
		p.onCookies(cookies)
	}

	return nil
}

// rewriteProxySetCookies normalizes Set-Cookie headers for localhost HTTP embedding.
// HTTPS backends set Secure cookies that browsers refuse to store on http://127.0.0.1,
// which breaks Django CSRF on login POST.
func rewriteProxySetCookies(resp *http.Response) []*http.Cookie {
	cookies := resp.Cookies()
	if len(cookies) == 0 {
		return nil
	}

	resp.Header.Del("Set-Cookie")
	for _, cookie := range cookies {
		normalizeProxyCookie(cookie)
		resp.Header.Add("Set-Cookie", cookie.String())
	}

	return cookies
}

func normalizeProxyCookie(cookie *http.Cookie) {
	if cookie == nil {
		return
	}

	cookie.Domain = ""
	cookie.Secure = false
	if cookie.SameSite == http.SameSiteNoneMode {
		cookie.SameSite = http.SameSiteLaxMode
	}
	NormalizeExpiry(cookie)
}

func (p *LoginProxy) rewriteToProxy(raw string) string {
	base := p.BaseURL()
	if base == "" {
		return raw
	}

	parsed, err := url.Parse(raw)
	if err != nil {
		return raw
	}

	targetHost := p.target.Host
	proxyHost := p.listener.Addr().String()

	switch {
	case parsed.Host == targetHost:
		parsed.Scheme = "http"
		parsed.Host = proxyHost
		return parsed.String()
	case parsed.Host == "":
		// Relative redirect — keep as-is for the proxy client.
		return raw
	default:
		return raw
	}
}
