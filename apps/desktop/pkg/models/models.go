package models

import (
	"fmt"
	"time"
)

// User represents a Plane user
type User struct {
	ID          string `json:"id"`
	Email       string `json:"email"`
	FirstName   string `json:"first_name"`
	LastName    string `json:"last_name"`
	Avatar      string `json:"avatar"`
	DisplayName string `json:"display_name"`
}

// Workspace represents a Plane workspace
type Workspace struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	Slug     string `json:"slug"`
	Logo     string `json:"logo"`
	OwnerID  string `json:"owner"`
}

// Project represents a Plane project
type Project struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Identifier  string `json:"identifier"`
	Description string `json:"description"`
	WorkspaceID string `json:"workspace"`
}

// Issue represents a Plane work item/issue
type Issue struct {
	ID                string    `json:"id"`
	ProjectID         string    `json:"project_id"`
	Name              string    `json:"name"`
	Description       string    `json:"description"`
	SequenceID        int       `json:"sequence_id"`
	Priority          string    `json:"priority"`
	State             string    `json:"state"`
	StateDetail       *State    `json:"state_detail"`
	StateGroup        string    `json:"state__group"`
	StateName         string    `json:"state__name"`
	StateColor        string    `json:"state__color"`
	ProjectIdentifier string    `json:"project__identifier"`
	WorkspaceSlug     string    `json:"workspace__slug"`
	CreatedAt         time.Time `json:"created_at"`
	UpdatedAt         time.Time `json:"updated_at"`
}

// NormalizeState maps flat state fields from search responses into StateDetail.
func (i *Issue) NormalizeState() {
	if i.StateDetail != nil || i.StateGroup == "" {
		return
	}
	i.StateDetail = &State{
		Name:  i.StateName,
		Color: i.StateColor,
		Group: i.StateGroup,
	}
}

// IsClosed reports whether the issue is in a completed or cancelled state group.
func (i *Issue) IsClosed() bool {
	i.NormalizeState()
	if i.StateDetail == nil {
		return false
	}
	group := i.StateDetail.Group
	return group == "completed" || group == "cancelled"
}

// FilterOpenIssues returns issues that are not completed or cancelled.
func FilterOpenIssues(issues []Issue) []Issue {
	open := make([]Issue, 0, len(issues))
	for _, issue := range issues {
		if issue.IsClosed() {
			continue
		}
		issue.NormalizeState()
		open = append(open, issue)
	}
	return open
}

// DisplayIdentifier returns the human-readable issue identifier (e.g., "PROJ-123")
func (i *Issue) DisplayIdentifier() string {
	if i.ProjectIdentifier != "" && i.SequenceID > 0 {
		return fmt.Sprintf("%s-%d", i.ProjectIdentifier, i.SequenceID)
	}
	if i.Name != "" {
		return i.Name
	}
	return i.ID
}

// State represents an issue state
type State struct {
	ID    string `json:"id"`
	Name  string `json:"name"`
	Color string `json:"color"`
	Group string `json:"group"`
}

// WorkLog represents a time tracking entry
type WorkLog struct {
	ID        string    `json:"id"`
	IssueID   string    `json:"issue"`
	UserID    string    `json:"created_by"`
	StartTime time.Time `json:"start_time"`
	EndTime   *time.Time `json:"end_time"`
	Duration  int       `json:"duration"` // Duration in seconds
	IsActive  bool      `json:"is_active"`
}

// IssueFilters represents filters for fetching issues
type IssueFilters struct {
	AssignedTo  string
	CreatedBy   string
	Priority    []string
	State       []string
	ProjectID   string
	Search      string
	Limit       int
	Offset      int
}
