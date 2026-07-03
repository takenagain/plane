package main

import (
	"testing"

	"github.com/takenagain/plane/apps/desktop/pkg/models"
)

func TestFilterOpenIssues(t *testing.T) {
	issues := []models.Issue{
		{ID: "1", Name: "Open", StateDetail: &models.State{Group: "started"}},
		{ID: "2", Name: "Done", StateDetail: &models.State{Group: "completed"}},
		{ID: "3", Name: "Dropped", StateDetail: &models.State{Group: "cancelled"}},
		{ID: "4", Name: "No detail"},
	}

	filtered := models.FilterOpenIssues(issues)
	if len(filtered) != 2 {
		t.Fatalf("expected 2 open issues, got %d", len(filtered))
	}
	if filtered[0].ID != "1" || filtered[1].ID != "4" {
		t.Fatalf("unexpected filtered issues: %+v", filtered)
	}
}

func TestIsClosedIssueState(t *testing.T) {
	started := models.Issue{StateDetail: &models.State{Group: "started"}}
	if started.IsClosed() {
		t.Fatal("started should not be closed")
	}
	completed := models.Issue{StateDetail: &models.State{Group: "completed"}}
	if !completed.IsClosed() {
		t.Fatal("completed should be closed")
	}
	cancelled := models.Issue{StateDetail: &models.State{Group: "cancelled"}}
	if !cancelled.IsClosed() {
		t.Fatal("cancelled should be closed")
	}
}
