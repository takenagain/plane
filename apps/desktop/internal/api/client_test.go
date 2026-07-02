package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/takenagain/plane/apps/desktop/internal/cookie"
)

func TestSearchIssues(t *testing.T) {
	t.Parallel()

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/workspaces/acme/issues/search/" {
			t.Fatalf("unexpected path: %s", r.URL.Path)
		}

		if got := r.URL.Query().Get("search"); got != "login" {
			t.Fatalf("unexpected search query: %q", got)
		}

		if got := r.URL.Query().Get("workspace_search"); got != "true" {
			t.Fatalf("unexpected workspace_search: %q", got)
		}

		_ = json.NewEncoder(w).Encode(map[string]any{
			"issues": []map[string]any{
				{
					"id":                  "issue-1",
					"name":                "Fix login bug",
					"sequence_id":         42,
					"project_id":          "project-1",
					"project__identifier": "WEB",
					"workspace__slug":     "acme",
				},
			},
		})
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

	if len(issues) != 1 {
		t.Fatalf("expected 1 issue, got %d", len(issues))
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
}
