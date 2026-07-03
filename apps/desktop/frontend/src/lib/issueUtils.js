/** Shared issue search helpers for inline combobox and dialogs. */

export function issueIdentifier(issue) {
  if (issue?.project__identifier && issue?.sequence_id) {
    return `${issue.project__identifier}-${issue.sequence_id}`;
  }
  return issue?.id ?? "";
}

export function issueStatus(issue) {
  if (issue?.state_detail?.name) {
    return issue.state_detail.name;
  }
  return issue?.state ?? "";
}

export function fuzzyScore(text, search) {
  const value = (text || "").toLowerCase();
  const term = search.toLowerCase().trim();
  if (!term) {
    return 0;
  }
  if (value === term) {
    return 100;
  }
  if (value.includes(term)) {
    return 80 + (term.length / Math.max(value.length, 1)) * 20;
  }

  let score = 0;
  let start = 0;
  for (const char of term) {
    const index = value.indexOf(char, start);
    if (index === -1) {
      return 0;
    }
    score += 10 - Math.min(index - start, 9);
    start = index + 1;
  }
  return score;
}

export function rankIssues(results, searchQuery) {
  const term = searchQuery.trim();
  if (!term) {
    return results;
  }

  return [...results]
    .map((issue) => ({
      issue,
      score: Math.max(fuzzyScore(issue.name, term), fuzzyScore(issueIdentifier(issue), term)),
    }))
    .filter((entry) => entry.score > 0)
    .toSorted((a, b) => b.score - a.score)
    .map((entry) => entry.issue);
}

export function formatDuration(totalSeconds) {
  const seconds = Math.max(0, totalSeconds || 0);
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return [h, m, s].map((n) => String(n).padStart(2, "0")).join(":");
}

export function formatElapsed(totalSeconds) {
  return formatDuration(totalSeconds);
}

export function priorityLabel(priority) {
  if (!priority || priority === "none") {
    return "No priority";
  }
  return priority.charAt(0).toUpperCase() + priority.slice(1);
}

export function formatDueDate(targetDate) {
  if (!targetDate) {
    return "No due date";
  }
  const date = new Date(targetDate);
  if (Number.isNaN(date.getTime())) {
    return "No due date";
  }
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export const EMPTY_FILTERS = {
  assignees: [],
  project: "",
  module: "",
  cycle: "",
  priority: [],
  state_group: [],
  labels: [],
};

export function hasActiveFilters(filters) {
  return Boolean(
    filters.project ||
    filters.module ||
    filters.cycle ||
    filters.assignees?.length ||
    filters.priority?.length ||
    filters.state_group?.length ||
    filters.labels?.length
  );
}

export function toggleFilterValue(list, value) {
  const current = list ?? [];
  if (current.includes(value)) {
    return current.filter((item) => item !== value);
  }
  return [...current, value];
}
