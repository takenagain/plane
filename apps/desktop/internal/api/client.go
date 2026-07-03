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
	baseURL         string
	httpClient      *http.Client
	cookieManager   *cookie.Manager
	onAuthError     func()
	searchProjectID string
	projectCache    map[string]models.Project
}

// NewClient creates a new Plane API client
func NewClient(baseURL string, cookieMgr *cookie.Manager) *Client {
	return &Client{
		baseURL: strings.TrimSuffix(baseURL, "/"),
		httpClient: &http.Client{
			Timeout: 30 * time.Second,
		},
		cookieManager: cookieMgr,
		projectCache:  make(map[string]models.Project),
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

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("User-Agent", "Plane Desktop/1.0")

	cookies := c.cookieManager.GetCookiesForRequest(req.URL.Host)
	for _, cookie := range cookies {
		req.AddCookie(cookie)
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("request failed: %w", err)
	}

	if resp.StatusCode == http.StatusUnauthorized {
		resp.Body.Close()
		if c.onAuthError != nil {
			c.onAuthError()
		}
		return nil, fmt.Errorf("authentication failed: status %d", resp.StatusCode)
	}

	if resp.StatusCode == http.StatusForbidden {
		resp.Body.Close()
		return nil, fmt.Errorf("forbidden: status %d", resp.StatusCode)
	}

	return resp, nil
}

func decodeJSON(resp *http.Response, target interface{}) error {
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("unexpected status: %d", resp.StatusCode)
	}
	if err := json.NewDecoder(resp.Body).Decode(target); err != nil {
		return fmt.Errorf("failed to decode response: %w", err)
	}
	return nil
}

// GetCurrentUser fetches the currently authenticated user
func (c *Client) GetCurrentUser() (*models.User, error) {
	resp, err := c.doRequest("GET", "/api/users/me/", nil)
	if err != nil {
		return nil, err
	}

	var user models.User
	if err := decodeJSON(resp, &user); err != nil {
		return nil, err
	}
	return &user, nil
}

// GetWorkspaces fetches all workspaces for the current user
func (c *Client) GetWorkspaces() ([]models.Workspace, error) {
	resp, err := c.doRequest("GET", "/api/users/me/workspaces/", nil)
	if err != nil {
		return nil, err
	}

	var workspaces []models.Workspace
	if err := decodeJSON(resp, &workspaces); err != nil {
		return nil, err
	}
	return workspaces, nil
}

type apiIssue struct {
	ID          string    `json:"id"`
	Name        string    `json:"name"`
	ProjectID   string    `json:"project_id"`
	SequenceID  int       `json:"sequence_id"`
	Priority    string    `json:"priority"`
	StateID     string    `json:"state_id"`
	StateGroup  string    `json:"state__group"`
	TargetDate  *string   `json:"target_date"`
	CycleID     *string   `json:"cycle_id"`
	ModuleIDs   []string  `json:"module_ids"`
	AssigneeIDs []string  `json:"assignee_ids"`
	TimeLogged  *float64  `json:"time_logged"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

type paginatedIssuesResponse struct {
	Results []apiIssue `json:"results"`
}

func parseAPIDate(value *string) *time.Time {
	if value == nil || *value == "" {
		return nil
	}
	for _, layout := range []string{time.RFC3339, "2006-01-02"} {
		if parsed, err := time.Parse(layout, *value); err == nil {
			return &parsed
		}
	}
	return nil
}

func (c *Client) convertAPIIssue(raw apiIssue) models.Issue {
	issue := models.Issue{
		ID:          raw.ID,
		Name:        raw.Name,
		ProjectID:   raw.ProjectID,
		SequenceID:  raw.SequenceID,
		Priority:    raw.Priority,
		StateID:     raw.StateID,
		StateGroup:  raw.StateGroup,
		TargetDate:  parseAPIDate(raw.TargetDate),
		ModuleIDs:   raw.ModuleIDs,
		AssigneeIDs: raw.AssigneeIDs,
		CreatedAt:   raw.CreatedAt,
		UpdatedAt:   raw.UpdatedAt,
	}
	if raw.CycleID != nil {
		issue.CycleID = *raw.CycleID
	}
	if raw.TimeLogged != nil {
		issue.TimeLogged = int(*raw.TimeLogged)
	}
	if project, ok := c.projectCache[raw.ProjectID]; ok {
		issue.ProjectIdentifier = project.Identifier
	}
	issue.NormalizeState()
	return issue
}

func (c *Client) buildIssueFilterParams(filters models.IssueFilters) url.Values {
	params := url.Values{}

	if len(filters.Assignees) > 0 {
		params.Add("assignees", strings.Join(filters.Assignees, ","))
	}
	if filters.Project != "" {
		params.Add("project", filters.Project)
	}
	if filters.Module != "" {
		params.Add("module", filters.Module)
	}
	if filters.Cycle != "" {
		params.Add("cycle", filters.Cycle)
	}
	if len(filters.Priority) > 0 {
		params.Add("priority", strings.Join(filters.Priority, ","))
	}
	if len(filters.StateGroup) > 0 {
		params.Add("state_group", strings.Join(filters.StateGroup, ","))
	}
	if len(filters.Labels) > 0 {
		params.Add("labels", strings.Join(filters.Labels, ","))
	}
	if filters.Search != "" {
		params.Add("search", filters.Search)
	}
	if filters.Offset > 0 {
		params.Add("cursor", fmt.Sprintf("100:%d:0", filters.Offset))
	}

	params.Add("order_by", "target_date")

	limit := filters.Limit
	if limit <= 0 {
		limit = 100
	}
	params.Add("per_page", fmt.Sprintf("%d", limit))

	return params
}

// GetMyIssues fetches issues for a user via the workspace user-issues endpoint.
func (c *Client) GetMyIssues(workspaceSlug, userID string, filters models.IssueFilters) ([]models.Issue, error) {
	if err := c.ensureProjectCache(workspaceSlug); err != nil {
		return nil, err
	}

	params := c.buildIssueFilterParams(filters)
	path := fmt.Sprintf("/api/workspaces/%s/user-issues/%s/?%s", workspaceSlug, userID, params.Encode())

	resp, err := c.doRequest("GET", path, nil)
	if err != nil {
		return nil, err
	}

	var page paginatedIssuesResponse
	if err := decodeJSON(resp, &page); err != nil {
		return nil, err
	}

	issues := make([]models.Issue, 0, len(page.Results))
	for _, raw := range page.Results {
		issues = append(issues, c.convertAPIIssue(raw))
	}
	return issues, nil
}

func (c *Client) ensureProjectCache(workspaceSlug string) error {
	if len(c.projectCache) > 0 {
		return nil
	}

	projects, err := c.GetProjects(workspaceSlug)
	if err != nil {
		return err
	}
	for _, project := range projects {
		c.projectCache[project.ID] = project
	}
	return nil
}

// GetProjects lists workspace projects.
func (c *Client) GetProjects(workspaceSlug string) ([]models.Project, error) {
	path := fmt.Sprintf("/api/workspaces/%s/projects/", workspaceSlug)
	resp, err := c.doRequest("GET", path, nil)
	if err != nil {
		return nil, err
	}

	var projects []models.Project
	if err := decodeJSON(resp, &projects); err != nil {
		return nil, err
	}
	return projects, nil
}

func (c *Client) getSearchProjectID(workspaceSlug string) (string, error) {
	if c.searchProjectID != "" {
		return c.searchProjectID, nil
	}

	projects, err := c.GetProjects(workspaceSlug)
	if err != nil {
		return "", err
	}
	if len(projects) == 0 {
		return "", fmt.Errorf("no projects in workspace")
	}

	c.searchProjectID = projects[0].ID
	for _, project := range projects {
		c.projectCache[project.ID] = project
	}
	return c.searchProjectID, nil
}

// SearchIssues searches open issues across the workspace matching a query.
func (c *Client) SearchIssues(workspaceSlug, query string) ([]models.Issue, error) {
	projectID, err := c.getSearchProjectID(workspaceSlug)
	if err != nil {
		return nil, err
	}

	params := url.Values{}
	params.Add("search", query)
	params.Add("workspace_search", "true")

	path := fmt.Sprintf(
		"/api/workspaces/%s/projects/%s/search-issues/?%s",
		workspaceSlug,
		projectID,
		params.Encode(),
	)

	resp, err := c.doRequest("GET", path, nil)
	if err != nil {
		return nil, err
	}

	var issues []models.Issue
	if err := decodeJSON(resp, &issues); err != nil {
		return nil, err
	}

	for i := range issues {
		issues[i].NormalizeState()
	}

	return models.FilterOpenIssues(issues), nil
}

// GetFilterOptions loads filter dimensions for the work items list.
func (c *Client) GetFilterOptions(workspaceSlug string) (*models.FilterOptions, error) {
	projects, err := c.GetProjects(workspaceSlug)
	if err != nil {
		return nil, err
	}

	for _, project := range projects {
		c.projectCache[project.ID] = project
	}

	projectOptions := make([]models.FilterOption, 0, len(projects))
	for _, project := range projects {
		projectOptions = append(projectOptions, models.FilterOption{
			ID:   project.ID,
			Name: project.Name,
		})
	}

	modules, err := c.getWorkspaceModules(workspaceSlug)
	if err != nil {
		return nil, err
	}

	cycles, err := c.getWorkspaceCycles(workspaceSlug)
	if err != nil {
		return nil, err
	}

	members, err := c.getWorkspaceMembers(workspaceSlug)
	if err != nil {
		return nil, err
	}

	return &models.FilterOptions{
		Projects: projectOptions,
		Modules:  modules,
		Cycles:   cycles,
		Members:  members,
		Priorities: []string{
			"urgent", "high", "medium", "low", "none",
		},
		StateGroups: []string{
			"backlog", "unstarted", "started", "completed", "cancelled",
		},
	}, nil
}

func (c *Client) getWorkspaceModules(workspaceSlug string) ([]models.FilterOption, error) {
	path := fmt.Sprintf("/api/workspaces/%s/modules/", workspaceSlug)
	resp, err := c.doRequest("GET", path, nil)
	if err != nil {
		return nil, err
	}

	var raw []struct {
		ID        string `json:"id"`
		Name      string `json:"name"`
		ProjectID string `json:"project_id"`
	}
	if err := decodeJSON(resp, &raw); err != nil {
		return nil, err
	}

	options := make([]models.FilterOption, 0, len(raw))
	for _, item := range raw {
		options = append(options, models.FilterOption{
			ID:        item.ID,
			Name:      item.Name,
			ProjectID: item.ProjectID,
		})
	}
	return options, nil
}

func (c *Client) getWorkspaceCycles(workspaceSlug string) ([]models.FilterOption, error) {
	path := fmt.Sprintf("/api/workspaces/%s/cycles/", workspaceSlug)
	resp, err := c.doRequest("GET", path, nil)
	if err != nil {
		return nil, err
	}

	var raw []struct {
		ID        string `json:"id"`
		Name      string `json:"name"`
		ProjectID string `json:"project_id"`
	}
	if err := decodeJSON(resp, &raw); err != nil {
		return nil, err
	}

	options := make([]models.FilterOption, 0, len(raw))
	for _, item := range raw {
		options = append(options, models.FilterOption{
			ID:        item.ID,
			Name:      item.Name,
			ProjectID: item.ProjectID,
		})
	}
	return options, nil
}

func (c *Client) getWorkspaceMembers(workspaceSlug string) ([]models.MemberOption, error) {
	path := fmt.Sprintf("/api/workspaces/%s/members/", workspaceSlug)
	resp, err := c.doRequest("GET", path, nil)
	if err != nil {
		return nil, err
	}

	var raw []struct {
		Member struct {
			ID          string `json:"id"`
			Email       string `json:"email"`
			DisplayName string `json:"display_name"`
			FirstName   string `json:"first_name"`
			LastName    string `json:"last_name"`
		} `json:"member"`
	}
	if err := decodeJSON(resp, &raw); err != nil {
		return nil, err
	}

	members := make([]models.MemberOption, 0, len(raw))
	for _, item := range raw {
		name := item.Member.DisplayName
		if name == "" {
			name = strings.TrimSpace(item.Member.FirstName + " " + item.Member.LastName)
		}
		if name == "" {
			name = item.Member.Email
		}
		members = append(members, models.MemberOption{
			ID:          item.Member.ID,
			DisplayName: name,
			Email:       item.Member.Email,
		})
	}
	return members, nil
}

// GetIssueTotalTime returns total logged seconds for an issue.
func (c *Client) GetIssueTotalTime(workspaceSlug, projectID, issueID string) (int, error) {
	path := fmt.Sprintf(
		"/api/workspaces/%s/projects/%s/issues/%s/worklogs/total/",
		workspaceSlug, projectID, issueID,
	)

	resp, err := c.doRequest("GET", path, nil)
	if err != nil {
		return 0, err
	}

	var result struct {
		TotalDuration int `json:"total_duration"`
	}
	if err := decodeJSON(resp, &result); err != nil {
		return 0, err
	}
	// Plane API aggregates worklog duration in minutes; desktop UI expects seconds.
	return result.TotalDuration * 60, nil
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

// StopTimeTracking stops the active time tracking session for an issue.
// worklogID is retained for caller context; the API stops the actor's active worklog.
func (c *Client) StopTimeTracking(workspaceSlug, projectID, issueID, worklogID string) error {
	path := fmt.Sprintf("/api/workspaces/%s/projects/%s/issues/%s/worklogs/stop/",
		workspaceSlug, projectID, issueID)

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

// ClearProjectCache resets cached project metadata (e.g. on workspace change).
func (c *Client) ClearProjectCache() {
	c.projectCache = make(map[string]models.Project)
	c.searchProjectID = ""
}
