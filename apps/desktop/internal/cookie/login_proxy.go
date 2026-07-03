package cookie

import (
	"context"
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
	// ProxySecretCookie is set by the proxy after a valid bootstrap request.
	ProxySecretCookie = "plane_desktop_proxy_secret"
	// ProxyBootstrapQuery is a one-time token query parameter for iframe bootstrap.
	ProxyBootstrapQuery = "plane_desktop_bootstrap"
)

type proxyContextKey struct{}

// LoginProxy reverse-proxies the Plane web UI so Set-Cookie headers can be captured
// for the Go API client while the user signs in through an embedded iframe.
type LoginProxy struct {
	target   *url.URL
	server   *http.Server
	listener net.Listener
	onCookies func([]*http.Cookie)

	mu              sync.Mutex
	started         bool
	sessionSecret   string
	bootstrapTokens map[string]struct{}
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
		target:          target,
		onCookies:       onCookies,
		bootstrapTokens: make(map[string]struct{}),
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

	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		authorized := p.validateProxySecret(r)
		if !authorized {
			if !p.consumeBootstrapToken(r) {
				http.Error(w, "forbidden", http.StatusForbidden)
				return
			}
			r = r.WithContext(context.WithValue(r.Context(), proxyContextKey{}, true))
		}
		proxy.ServeHTTP(w, r)
	})

	p.listener = listener
	p.server = &http.Server{Handler: handler}
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

// URLWithBootstrap returns a proxy URL with a one-time bootstrap token.
func (p *LoginProxy) URLWithBootstrap(path string) string {
	base := strings.TrimSuffix(p.BaseURL(), "/")
	if base == "" {
		return base + path
	}

	token := p.createBootstrapToken()
	if token == "" {
		return base + path
	}

	parsed, err := url.Parse(base + path)
	if err != nil {
		return base + path
	}

	query := parsed.Query()
	query.Set(ProxyBootstrapQuery, token)
	parsed.RawQuery = query.Encode()
	return parsed.String()
}

func (p *LoginProxy) createBootstrapToken() string {
	token := generateProxySecret()
	p.mu.Lock()
	defer p.mu.Unlock()
	p.bootstrapTokens[token] = struct{}{}
	return token
}

func (p *LoginProxy) consumeBootstrapToken(req *http.Request) bool {
	if req == nil {
		return false
	}

	token := req.URL.Query().Get(ProxyBootstrapQuery)
	if token == "" {
		return false
	}

	p.mu.Lock()
	defer p.mu.Unlock()
	if _, ok := p.bootstrapTokens[token]; !ok {
		return false
	}
	delete(p.bootstrapTokens, token)
	return true
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

	for _, cookie := range req.Cookies() {
		if cookie.Name == ProxySecretCookie {
			return subtle.ConstantTimeCompare([]byte(cookie.Value), expected) == 1
		}
	}

	return false
}

func (p *LoginProxy) shouldIssueProxyCookie(req *http.Request) bool {
	if req == nil {
		return false
	}
	if p.validateProxySecret(req) {
		return true
	}
	return req.Context().Value(proxyContextKey{}) == true
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
}

func (p *LoginProxy) modifyResponse(resp *http.Response) error {
	if resp == nil {
		return nil
	}

	if resp.Request != nil && p.shouldIssueProxyCookie(resp.Request) {
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
