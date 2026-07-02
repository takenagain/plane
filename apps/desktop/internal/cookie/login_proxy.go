package cookie

import (
	"fmt"
	"net"
	"net/http"
	"net/http/httputil"
	"net/url"
	"strings"
	"sync"
)

// LoginProxy reverse-proxies the Plane web UI so Set-Cookie headers can be captured
// for the Go API client while the user signs in through an embedded iframe.
type LoginProxy struct {
	target   *url.URL
	server   *http.Server
	listener net.Listener
	onCookies func([]*http.Cookie)

	mu      sync.Mutex
	started bool
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

// Start listens on localhost and serves proxied Plane content.
func (p *LoginProxy) Start() (string, error) {
	p.mu.Lock()
	defer p.mu.Unlock()

	if p.started {
		return p.BaseURL(), nil
	}

	listener, err := net.Listen("tcp", "127.0.0.1:0")
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
	if resp == nil || p.onCookies == nil {
		return nil
	}

	cookies := resp.Cookies()
	if len(cookies) == 0 {
		return nil
	}

	for _, cookie := range cookies {
		cookie.Domain = ""
		NormalizeExpiry(cookie)
	}

	p.onCookies(cookies)
	return nil
}
