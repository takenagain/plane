package models

import "testing"

func TestIssueDisplayIdentifier(t *testing.T) {
	t.Parallel()

	issue := Issue{
		ProjectIdentifier: "WEB",
		SequenceID:        42,
		Name:              "Fix login bug",
	}

	if got := issue.DisplayIdentifier(); got != "WEB-42" {
		t.Fatalf("DisplayIdentifier() = %q, want WEB-42", got)
	}
}

func TestIssueDisplayIdentifierFallback(t *testing.T) {
	t.Parallel()

	issue := Issue{
		ID:   "issue-1",
		Name: "Untitled issue",
	}

	if got := issue.DisplayIdentifier(); got != "Untitled issue" {
		t.Fatalf("DisplayIdentifier() = %q, want Untitled issue", got)
	}
}
