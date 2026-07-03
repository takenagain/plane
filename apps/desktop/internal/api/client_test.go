package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/takenagain/plane/apps/desktop/internal/cookie"
	"github.com/takenagain/plane/apps/desktop/pkg/models"
)

func TestGetWorkspacesUsesUserEndpoint(t *testing.T) {
	t.Parallel()

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/users/me/workspaces/" {
			t.Fatalf("unexpected path: %s", r.URL.Path)
		}

		_ = json.NewEncoder(w).Encode([]map[string]any{
			{"id": "ws-1", "slug": "acme", "name": "Acme"},
		})
	}))
	t.Cleanup(server.Close)

	cookieMgr, err := cookie.NewManager()
	if err != nil {
		t.Fatalf("cookie manager: %v", err)
	}

	client := NewClient(server.URL, cookieMgr)
	workspaces, err := client.GetWorkspaces()
	if err != nil {
		t.Fatalf("GetWorkspaces returned error: %v", err)
	}

	if len(workspaces) != 1 || workspaces[0].Slug != "acme" {
		t.Fatalf("unexpected workspaces: %+v", workspaces)
	}
}

func TestSearchIssues(t *testing.T) {
	t.Parallel()

	projectListed := false

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/api/workspaces/acme/projects/":
			projectListed = true
			_ = json.NewEncoder(w).Encode([]map[string]any{
				{"id": "project-1", "identifier": "WEB", "name": "Web"},
			})
		case "/api/workspaces/acme/projects/project-1/search-issues/":
			if got := r.URL.Query().Get("search"); got != "login" {
				t.Fatalf("unexpected search query: %q", got)
			}

			if got := r.URL.Query().Get("workspace_search"); got != "true" {
				t.Fatalf("unexpected workspace_search: %q", got)
			}

			_ = json.NewEncoder(w).Encode([]map[string]any{
				{
					"id":                  "issue-1",
					"name":                "Fix login bug",
					"sequence_id":         42,
					"project_id":          "project-1",
					"project__identifier": "WEB",
					"workspace__slug":     "acme",
					"state__group":        "started",
					"state__name":         "In Progress",
				},
				{
					"id":           "issue-2",
					"name":         "Login done",
					"state__group": "completed",
				},
			})
		default:
			t.Fatalf("unexpected path: %s", r.URL.Path)
		}
	}))
	t.Cleanup(server.Close)

	cookieMgr, err := cookie.NewManager()
	if err != nil {
		t.Fatalf("cookie manager: %v", err)
	}

	client := NewClient(server.URL, cookieMgr)
	issues, err := client.SearchIssues("acme", "login")
	if err != nil {
		t.Fatalf("SearchIssues returned error: %v", err)
	}

	if !projectListed {
		t.Fatal("expected project list request")
	}

	if len(issues) != 1 {
		t.Fatalf("expected 1 open issue, got %d", len(issues))
	}

	issue := issues[0]
	if issue.ID != "issue-1" {
		t.Fatalf("unexpected issue id: %q", issue.ID)
	}
	if issue.ProjectID != "project-1" {
		t.Fatalf("unexpected project id: %q", issue.ProjectID)
	}
	if issue.DisplayIdentifier() != "WEB-42" {
		t.Fatalf("unexpected identifier: %q", issue.DisplayIdentifier())
	}
	if issue.StateDetail == nil || issue.StateDetail.Group != "started" {
		t.Fatalf("expected normalized started state, got %+v", issue.StateDetail)
	}
}

func TestGetMyIssuesUsesUserIssuesEndpoint(t *testing.T) {
	t.Parallel()

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/api/workspaces/acme/projects/":
			_ = json.NewEncoder(w).Encode([]map[string]any{
				{"id": "project-1", "identifier": "WEB", "name": "Web"},
			})
		case "/api/workspaces/acme/user-issues/user-1/":
			if got := r.URL.Query().Get("project"); got != "project-1" {
				t.Fatalf("unexpected project filter: %q", got)
			}
			if got := r.URL.Query().Get("assignees"); got != "user-1" {
				t.Fatalf("unexpected assignees filter: %q", got)
			}

			_ = json.NewEncoder(w).Encode(map[string]any{
				"results": []map[string]any{
					{
						"id":           "issue-1",
						"name":         "Assigned task",
						"project_id":   "project-1",
						"sequence_id":  7,
						"priority":     "high",
						"state__group": "started",
						"target_date":  "2026-03-15",
					},
				},
			})
		default:
			t.Fatalf("unexpected path: %s", r.URL.Path)
		}
	}))
	t.Cleanup(server.Close)

	cookieMgr, err := cookie.NewManager()
	if err != nil {
		t.Fatalf("cookie manager: %v", err)
	}

	client := NewClient(server.URL, cookieMgr)
	issues, err := client.GetMyIssues("acme", "user-1", models.IssueFilters{
		Assignees: []string{"user-1"},
		Project:   "project-1",
	})
	if err != nil {
		t.Fatalf("GetMyIssues returned error: %v", err)
	}

	if len(issues) != 1 {
		t.Fatalf("expected 1 issue, got %d", len(issues))
	}
	if issues[0].DisplayIdentifier() != "WEB-7" {
		t.Fatalf("unexpected identifier: %q", issues[0].DisplayIdentifier())
	}
}

func TestStopTimeTrackingUsesStopEndpoint(t *testing.T) {
	t.Parallel()

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		expected := "/api/workspaces/acme/projects/project-1/issues/issue-1/worklogs/stop/"
		if r.URL.Path != expected {
			t.Fatalf("unexpected path: %s", r.URL.Path)
		}
		if r.Method != http.MethodPost {
			t.Fatalf("unexpected method: %s", r.Method)
		}
		w.WriteHeader(http.StatusOK)
	}))
	t.Cleanup(server.Close)

	cookieMgr, err := cookie.NewManager()
	if err != nil {
		t.Fatalf("cookie manager: %v", err)
	}

	client := NewClient(server.URL, cookieMgr)
	if err := client.StopTimeTracking("acme", "project-1", "issue-1", "wl-1"); err != nil {
		t.Fatalf("StopTimeTracking returned error: %v", err)
	}
}

func TestStartTimeTrackingDecodesWorklog(t *testing.T) {
	t.Parallel()

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		expected := "/api/workspaces/acme/projects/project-1/issues/issue-1/worklogs/start/"
		if r.URL.Path != expected {
			t.Fatalf("unexpected path: %s", r.URL.Path)
		}
		_ = json.NewEncoder(w).Encode(map[string]any{
			"id":         "wl-1",
			"issue":      "issue-1",
			"created_by": "user-1",
			"created_at": "2026-03-15T10:00:00Z",
			"duration":   0,
		})
	}))
	t.Cleanup(server.Close)

	cookieMgr, err := cookie.NewManager()
	if err != nil {
		t.Fatalf("cookie manager: %v", err)
	}

	client := NewClient(server.URL, cookieMgr)
	worklog, err := client.StartTimeTracking("acme", "project-1", "issue-1")
	if err != nil {
		t.Fatalf("StartTimeTracking returned error: %v", err)
	}
	if worklog.ID != "wl-1" {
		t.Fatalf("unexpected worklog id: %q", worklog.ID)
	}
	if !worklog.IsActive() {
		t.Fatal("expected active worklog (duration=0)")
	}
	if worklog.StartTime().UTC().Format(time.RFC3339) != "2026-03-15T10:00:00Z" {
		t.Fatalf("unexpected start time: %v", worklog.StartTime())
	}
}

func TestGetIssueTotalTime(t *testing.T) {
	t.Parallel()

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		expected := "/api/workspaces/acme/projects/project-1/issues/issue-1/worklogs/total/"
		if r.URL.Path != expected {
			t.Fatalf("unexpected path: %s", r.URL.Path)
		}
		_ = json.NewEncoder(w).Encode(map[string]any{"total_duration": 60})
	}))
	t.Cleanup(server.Close)

	cookieMgr, err := cookie.NewManager()
	if err != nil {
		t.Fatalf("cookie manager: %v", err)
	}

	client := NewClient(server.URL, cookieMgr)
	total, err := client.GetIssueTotalTime("acme", "project-1", "issue-1")
	if err != nil {
		t.Fatalf("GetIssueTotalTime returned error: %v", err)
	}
	if total != 3600 {
		t.Fatalf("expected 3600 seconds, got %d", total)
	}
}
