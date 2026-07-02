package api

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/takenagain/plane/apps/desktop/internal/cookie"
	"github.com/takenagain/plane/apps/desktop/pkg/models"
)

// Client represents the Plane API client
type Client struct {
	baseURL       string
	httpClient    *http.Client
	cookieManager *cookie.Manager
	onAuthError   func()
}

// NewClient creates a new Plane API client
func NewClient(baseURL string, cookieMgr *cookie.Manager) *Client {
	return &Client{
		baseURL: strings.TrimSuffix(baseURL, "/"),
		httpClient: &http.Client{
			Timeout: 30 * time.Second,
		},
		cookieManager: cookieMgr,
	}
}

// SetAuthErrorHandler registers a callback for authentication failures.
func (c *Client) SetAuthErrorHandler(handler func()) {
	c.onAuthError = handler
}
func (c *Client) doRequest(method, path string, body interface{}) (*http.Response, error) {
	var bodyReader io.Reader
	if body != nil {
		jsonData, err := json.Marshal(body)
		if err != nil {
			return nil, fmt.Errorf("failed to marshal request body: %w", err)
		}
		bodyReader = bytes.NewReader(jsonData)
	}

	req, err := http.NewRequest(method, c.baseURL+path, bodyReader)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	// Add headers
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("User-Agent", "Plane Desktop/1.0")

	// Add cookies
	cookies := c.cookieManager.GetCookiesForRequest(req.URL.Host)
	for _, cookie := range cookies {
		req.AddCookie(cookie)
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("request failed: %w", err)
	}

	// Check for authentication errors
	if resp.StatusCode == http.StatusUnauthorized || resp.StatusCode == http.StatusForbidden {
		resp.Body.Close()
		if c.onAuthError != nil {
			c.onAuthError()
		}
		return nil, fmt.Errorf("authentication failed: status %d", resp.StatusCode)
	}

	return resp, nil
}

// GetCurrentUser fetches the currently authenticated user
func (c *Client) GetCurrentUser() (*models.User, error) {
	resp, err := c.doRequest("GET", "/api/users/me/", nil)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("unexpected status: %d", resp.StatusCode)
	}

	var user models.User
	if err := json.NewDecoder(resp.Body).Decode(&user); err != nil {
		return nil, fmt.Errorf("failed to decode user: %w", err)
	}

	return &user, nil
}

// GetWorkspaces fetches all workspaces for the current user
func (c *Client) GetWorkspaces() ([]models.Workspace, error) {
	resp, err := c.doRequest("GET", "/api/workspaces/", nil)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("unexpected status: %d", resp.StatusCode)
	}

	var workspaces []models.Workspace
	if err := json.NewDecoder(resp.Body).Decode(&workspaces); err != nil {
		return nil, fmt.Errorf("failed to decode workspaces: %w", err)
	}

	return workspaces, nil
}

// GetMyIssues fetches issues assigned to the current user
func (c *Client) GetMyIssues(workspaceSlug string, filters models.IssueFilters) ([]models.Issue, error) {
	// Build query parameters
	params := url.Values{}
	if filters.AssignedTo != "" {
		params.Add("assignees", filters.AssignedTo)
	}
	if filters.Search != "" {
		params.Add("search", filters.Search)
	}
	if filters.ProjectID != "" {
		params.Add("project", filters.ProjectID)
	}
	if filters.Limit > 0 {
		params.Add("limit", fmt.Sprintf("%d", filters.Limit))
	}
	if filters.Offset > 0 {
		params.Add("offset", fmt.Sprintf("%d", filters.Offset))
	}

	path := fmt.Sprintf("/api/workspaces/%s/my-issues/", workspaceSlug)
	if len(params) > 0 {
		path += "?" + params.Encode()
	}

	resp, err := c.doRequest("GET", path, nil)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("unexpected status: %d", resp.StatusCode)
	}

	var issues []models.Issue
	if err := json.NewDecoder(resp.Body).Decode(&issues); err != nil {
		return nil, fmt.Errorf("failed to decode issues: %w", err)
	}

	return issues, nil
}

// SearchIssues searches for issues matching a query
func (c *Client) SearchIssues(workspaceSlug, query string) ([]models.Issue, error) {
	params := url.Values{}
	params.Add("search", query)
	params.Add("workspace_search", "true")
	params.Add("limit", "20")

	path := fmt.Sprintf("/api/workspaces/%s/issues/search/?%s", workspaceSlug, params.Encode())

	resp, err := c.doRequest("GET", path, nil)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("unexpected status: %d", resp.StatusCode)
	}

	var result struct {
		Issues []models.Issue `json:"issues"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("failed to decode search results: %w", err)
	}

	return result.Issues, nil
}

// StartTimeTracking starts time tracking for an issue
func (c *Client) StartTimeTracking(workspaceSlug, projectID, issueID string) (*models.WorkLog, error) {
	path := fmt.Sprintf("/api/workspaces/%s/projects/%s/issues/%s/worklogs/start/",
		workspaceSlug, projectID, issueID)

	resp, err := c.doRequest("POST", path, nil)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusCreated {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("unexpected status %d: %s", resp.StatusCode, string(body))
	}

	var worklog models.WorkLog
	if err := json.NewDecoder(resp.Body).Decode(&worklog); err != nil {
		return nil, fmt.Errorf("failed to decode worklog: %w", err)
	}

	return &worklog, nil
}

// StopTimeTracking stops time tracking for a worklog
func (c *Client) StopTimeTracking(workspaceSlug, projectID, issueID, worklogID string) error {
	path := fmt.Sprintf("/api/workspaces/%s/projects/%s/issues/%s/worklogs/%s/stop/",
		workspaceSlug, projectID, issueID, worklogID)

	resp, err := c.doRequest("POST", path, nil)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusNoContent {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("unexpected status %d: %s", resp.StatusCode, string(body))
	}

	return nil
}

// GetActiveTimeTracking fetches the currently active worklog for the user
func (c *Client) GetActiveTimeTracking(workspaceSlug string) (*models.WorkLog, error) {
	path := fmt.Sprintf("/api/workspaces/%s/worklogs/active/", workspaceSlug)

	resp, err := c.doRequest("GET", path, nil)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusNotFound {
		// No active worklog
		return nil, nil
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("unexpected status: %d", resp.StatusCode)
	}

	var worklog models.WorkLog
	if err := json.NewDecoder(resp.Body).Decode(&worklog); err != nil {
		return nil, fmt.Errorf("failed to decode worklog: %w", err)
	}

	return &worklog, nil
}

// TestConnection tests the API connection with the current cookies
func (c *Client) TestConnection() error {
	_, err := c.GetCurrentUser()
	return err
}
