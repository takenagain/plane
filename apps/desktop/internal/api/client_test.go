package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/takenagain/plane/apps/desktop/internal/cookie"
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
				{"id": "project-1"},
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
