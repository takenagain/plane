package models

import (
	"encoding/json"
	"testing"
	"time"
)

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

func TestWorkLogJSON(t *testing.T) {
	t.Parallel()

	var worklog WorkLog
	if err := json.Unmarshal([]byte(`{
		"id": "wl-1",
		"issue": "issue-1",
		"created_by": "user-1",
		"created_at": "2026-03-15T10:00:00Z",
		"duration": 0
	}`), &worklog); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if !worklog.IsActive() {
		t.Fatal("duration=0 should be active")
	}
	if worklog.StartTime().UTC().Format(time.RFC3339) != "2026-03-15T10:00:00Z" {
		t.Fatalf("unexpected start time: %v", worklog.StartTime())
	}

	var stopped WorkLog
	if err := json.Unmarshal([]byte(`{
		"id": "wl-2",
		"issue": "issue-1",
		"created_at": "2026-03-15T09:00:00Z",
		"duration": 15
	}`), &stopped); err != nil {
		t.Fatalf("unmarshal stopped: %v", err)
	}
	if stopped.IsActive() {
		t.Fatal("duration>0 should not be active")
	}
}

func TestSortIssues(t *testing.T) {
	t.Parallel()

	d1 := time.Date(2026, 3, 10, 0, 0, 0, 0, time.UTC)
	d2 := time.Date(2026, 3, 20, 0, 0, 0, 0, time.UTC)

	issues := []Issue{
		{ID: "a", Name: "Later", TargetDate: &d2, Priority: "low"},
		{ID: "b", Name: "Soon urgent", TargetDate: &d1, Priority: "urgent"},
		{ID: "c", Name: "Soon medium", TargetDate: &d1, Priority: "medium"},
		{ID: "d", Name: "No date", Priority: "urgent"},
	}

	SortIssues(issues)

	if issues[0].ID != "b" || issues[1].ID != "c" || issues[2].ID != "a" || issues[3].ID != "d" {
		t.Fatalf("unexpected sort order: %+v", issues)
	}
}
