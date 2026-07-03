package models

import "testing"

func TestFilterOpenIssues(t *testing.T) {
	t.Parallel()

	issues := []Issue{
		{ID: "1", Name: "Open", StateDetail: &State{Group: "started"}},
		{ID: "2", Name: "Done", StateDetail: &State{Group: "completed"}},
		{ID: "3", Name: "Cancelled", StateGroup: "cancelled"},
		{ID: "4", Name: "Unknown"},
	}

	open := FilterOpenIssues(issues)
	if len(open) != 2 {
		t.Fatalf("expected 2 open issues, got %d", len(open))
	}
	if open[0].ID != "1" || open[1].ID != "4" {
		t.Fatalf("unexpected open issues: %+v", open)
	}
}
