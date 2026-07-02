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
	ProjectIdentifier string    `json:"project__identifier"`
	WorkspaceSlug     string    `json:"workspace__slug"`
	CreatedAt         time.Time `json:"created_at"`
	UpdatedAt         time.Time `json:"updated_at"`
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
