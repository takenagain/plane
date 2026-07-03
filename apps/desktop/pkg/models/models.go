package models

import (
	"fmt"
	"sort"
	"strings"
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
	ID      string `json:"id"`
	Name    string `json:"name"`
	Slug    string `json:"slug"`
	Logo    string `json:"logo"`
	OwnerID string `json:"owner"`
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
	ID                string     `json:"id"`
	ProjectID         string     `json:"project_id"`
	Name              string     `json:"name"`
	Description       string     `json:"description"`
	SequenceID        int        `json:"sequence_id"`
	Priority          string     `json:"priority"`
	State             string     `json:"state"`
	StateID           string     `json:"state_id"`
	StateDetail       *State     `json:"state_detail"`
	StateGroup        string     `json:"state__group"`
	StateName         string     `json:"state__name"`
	StateColor        string     `json:"state__color"`
	ProjectIdentifier string     `json:"project__identifier"`
	WorkspaceSlug     string     `json:"workspace__slug"`
	TargetDate        *time.Time `json:"target_date"`
	CycleID           string     `json:"cycle_id"`
	ModuleIDs         []string   `json:"module_ids"`
	AssigneeIDs       []string   `json:"assignee_ids"`
	TimeLogged        int        `json:"time_logged"`
	CreatedAt         time.Time  `json:"created_at"`
	UpdatedAt         time.Time  `json:"updated_at"`
}

// NormalizeState maps flat state fields from search responses into StateDetail.
func (i *Issue) NormalizeState() {
	if i.StateDetail != nil {
		return
	}
	if i.StateGroup == "" {
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

var priorityRank = map[string]int{
	"urgent": 0,
	"high":   1,
	"medium": 2,
	"low":    3,
	"none":   4,
	"":       5,
}

func priorityOrder(priority string) int {
	if rank, ok := priorityRank[strings.ToLower(priority)]; ok {
		return rank
	}
	return 5
}

// SortIssues sorts by due date (target_date) ascending, then priority ascending.
// Issues without a due date are listed after dated issues.
func SortIssues(issues []Issue) {
	sort.SliceStable(issues, func(i, j int) bool {
		a := issues[i]
		b := issues[j]

		aHasDate := a.TargetDate != nil
		bHasDate := b.TargetDate != nil
		if aHasDate != bHasDate {
			return aHasDate
		}
		if aHasDate && bHasDate {
			if !a.TargetDate.Equal(*b.TargetDate) {
				return a.TargetDate.Before(*b.TargetDate)
			}
		}

		ap := priorityOrder(a.Priority)
		bp := priorityOrder(b.Priority)
		if ap != bp {
			return ap < bp
		}

		return a.Name < b.Name
	})
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

// WorkLog represents a time tracking entry from the Plane API.
// Active timers have duration=0; stopped worklogs have duration >= 1 (minutes).
type WorkLog struct {
	ID        string    `json:"id"`
	IssueID   string    `json:"issue"`
	ProjectID string    `json:"project"`
	IssueName string    `json:"issue_name"`
	UserID    string    `json:"created_by"`
	CreatedAt time.Time `json:"created_at"`
	Duration  int       `json:"duration"`
}

// IsActive reports whether the worklog is a running timer (duration sentinel 0).
func (w *WorkLog) IsActive() bool {
	return w.Duration == 0
}

// StartTime returns when the timer started (API uses created_at for active worklogs).
func (w *WorkLog) StartTime() time.Time {
	return w.CreatedAt
}

// IssueFilters represents filters for fetching issues.
type IssueFilters struct {
	Assignees  []string `json:"assignees"`
	Project    string   `json:"project"`
	Module     string   `json:"module"`
	Cycle      string   `json:"cycle"`
	Priority   []string `json:"priority"`
	StateGroup []string `json:"state_group"`
	Labels     []string `json:"labels"`
	Search     string   `json:"search"`
	Limit      int      `json:"limit"`
	Offset     int      `json:"offset"`
}

// FilterOption is a generic id/name pair for filter dropdowns.
type FilterOption struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	ProjectID string `json:"project_id,omitempty"`
}

// MemberOption is a workspace member for assignee filters.
type MemberOption struct {
	ID          string `json:"id"`
	DisplayName string `json:"display_name"`
	Email       string `json:"email"`
}

// FilterOptions contains available filter dimensions for the work items list.
type FilterOptions struct {
	Projects   []FilterOption `json:"projects"`
	Modules    []FilterOption `json:"modules"`
	Cycles     []FilterOption `json:"cycles"`
	Members    []MemberOption `json:"members"`
	Priorities []string       `json:"priorities"`
	StateGroups []string      `json:"state_groups"`
}
