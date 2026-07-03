<script>
  import { SearchIssues, StartTrackingIssue } from "../../wailsjs/go/main/App.js";

  let { open = false, workspace = null, onSelect = () => {}, onClose = () => {} } = $props();

  let query = $state("");
  let issues = $state([]);
  let loading = $state(false);
  let error = $state("");
  let selectedIndex = $state(0);
  let searchTimer = null;
  let inputEl = $state(null);
  let listboxId = "issue-search-listbox";

  const canSearch = $derived(Boolean(workspace?.slug));

  $effect(() => {
    if (!open) {
      query = "";
      issues = [];
      error = "";
      loading = false;
      selectedIndex = 0;
      clearTimeout(searchTimer);
      return;
    }

    selectedIndex = 0;
    if (!query.trim()) {
      issues = [];
      loading = false;
    }

    queueMicrotask(() => inputEl?.focus());
  });

  $effect(() => {
    if (!open || issues.length === 0) {
      return;
    }

    const selected = document.getElementById(`${listboxId}-option-${selectedIndex}`);
    selected?.scrollIntoView({ block: "nearest" });
  });

  function issueIdentifier(issue) {
    if (issue.project__identifier && issue.sequence_id) {
      return `${issue.project__identifier}-${issue.sequence_id}`;
    }
    return issue.id;
  }

  function issueMeta(issue) {
    const parts = [];
    if (issue.project__identifier) {
      parts.push(issue.project__identifier);
    }
    if (issue.state_detail?.name) {
      parts.push(issue.state_detail.name);
    } else if (issue.state) {
      parts.push(issue.state);
    }
    return parts.join(" · ");
  }

  function fuzzyScore(text, search) {
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

  function rankIssues(results, searchQuery) {
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
      .sort((a, b) => b.score - a.score)
      .map((entry) => entry.issue);
  }

  async function runSearch(searchQuery) {
    const trimmed = searchQuery.trim();
    if (!trimmed) {
      issues = [];
      loading = false;
      error = "";
      return;
    }

    if (!canSearch) {
      issues = [];
      loading = false;
      error = "No workspace selected. Sign in again or choose a workspace.";
      return;
    }

    loading = true;
    error = "";

    try {
      const results = await SearchIssues(trimmed);
      issues = rankIssues(results ?? [], trimmed);
      selectedIndex = 0;
    } catch (err) {
      issues = [];
      const message = String(err);
      if (message.includes("not authenticated")) {
        error = "You are not signed in. Close this dialog and sign in again.";
      } else {
        error = message;
      }
    } finally {
      loading = false;
    }
  }

  function handleInput(event) {
    query = event.target.value;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => runSearch(query), 300);
  }

  async function selectIssue(issue) {
    if (!issue?.id || !issue?.project_id) {
      error = "Selected issue is missing required fields";
      return;
    }

    loading = true;
    error = "";

    try {
      await StartTrackingIssue(issue);
      onSelect(issue);
      onClose();
    } catch (err) {
      error = String(err);
    } finally {
      loading = false;
    }
  }

  function handleKeydown(event) {
    if (!open) {
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (issues.length > 0) {
        selectedIndex = Math.min(selectedIndex + 1, issues.length - 1);
      }
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (issues.length > 0) {
        selectedIndex = Math.max(selectedIndex - 1, 0);
      }
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      if (issues[selectedIndex]) {
        selectIssue(issues[selectedIndex]);
      }
    }
  }

  function handleBackdropClick(event) {
    if (event.target === event.currentTarget) {
      onClose();
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

{#if open}
  <div class="backdrop" role="presentation" onclick={handleBackdropClick}>
    <div class="dialog" role="dialog" aria-modal="true" aria-labelledby="issue-dialog-title">
      <header class="dialog-header">
        <div>
          <h2 id="issue-dialog-title">Select issue to track</h2>
          {#if workspace?.name}
            <p class="workspace">{workspace.name}</p>
          {:else}
            <p class="workspace warning">No workspace available</p>
          {/if}
        </div>
        <button class="icon-btn" type="button" aria-label="Close" onclick={onClose}>×</button>
      </header>

      <div class="search-row">
        <input
          bind:this={inputEl}
          class="search-input"
          type="search"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={issues.length > 0}
          aria-controls={listboxId}
          aria-activedescendant={issues.length > 0 ? `${listboxId}-option-${selectedIndex}` : undefined}
          placeholder="Search by title or ID…"
          value={query}
          oninput={handleInput}
          disabled={!canSearch}
          autocomplete="off"
        />
      </div>

      {#if error}
        <p class="status error">{error}</p>
      {:else if !canSearch}
        <p class="status error">Sign in and select a workspace to search issues.</p>
      {:else if loading}
        <p class="status">Searching…</p>
      {:else if query.trim() && issues.length === 0}
        <p class="status">No open issues found for "{query.trim()}".</p>
      {:else if !query.trim()}
        <p class="status muted">Type to search open issues in your workspace.</p>
      {/if}

      {#if issues.length > 0}
        <ul class="issue-list" id={listboxId} role="listbox" aria-label="Search results">
          {#each issues as issue, index (issue.id)}
            <li role="presentation">
              <button
                id="{listboxId}-option-{index}"
                type="button"
                class="issue-item"
                class:selected={index === selectedIndex}
                role="option"
                aria-selected={index === selectedIndex}
                onclick={() => selectIssue(issue)}
              >
                <span class="issue-id">{issueIdentifier(issue)}</span>
                <span class="issue-name">{issue.name}</span>
                {#if issueMeta(issue)}
                  <span class="issue-meta">{issueMeta(issue)}</span>
                {/if}
              </button>
            </li>
          {/each}
        </ul>
      {/if}

      <footer class="dialog-footer">
        <span>↑↓ to navigate · Enter to select · Esc to close</span>
      </footer>
    </div>
  </div>
{/if}

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 1000;
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding: 4rem 1rem 1rem;
    background: rgba(15, 23, 42, 0.72);
  }

  .dialog {
    width: min(560px, 100%);
    max-height: calc(100vh - 5rem);
    display: flex;
    flex-direction: column;
    background: #1e293b;
    border: 1px solid rgba(148, 163, 184, 0.2);
    border-radius: 12px;
    box-shadow: 0 24px 48px rgba(0, 0, 0, 0.35);
    text-align: left;
    color: #e2e8f0;
  }

  .dialog-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1rem;
    padding: 1.25rem 1.25rem 0.75rem;
  }

  .dialog-header h2 {
    margin: 0;
    font-size: 1.125rem;
  }

  .workspace {
    margin: 0.25rem 0 0;
    font-size: 0.875rem;
    color: #94a3b8;
  }

  .workspace.warning {
    color: #fbbf24;
  }

  .icon-btn {
    border: none;
    background: transparent;
    color: #94a3b8;
    font-size: 1.5rem;
    line-height: 1;
    cursor: pointer;
    padding: 0.125rem 0.375rem;
    border-radius: 6px;
  }

  .icon-btn:hover {
    color: #e2e8f0;
    background: rgba(148, 163, 184, 0.12);
  }

  .search-row {
    padding: 0 1.25rem 0.75rem;
  }

  .search-input {
    width: 100%;
    box-sizing: border-box;
    padding: 0.75rem 0.875rem;
    border: 1px solid rgba(148, 163, 184, 0.25);
    border-radius: 8px;
    background: #0f172a;
    color: #e2e8f0;
    font: inherit;
  }

  .search-input:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .search-input:focus {
    outline: 2px solid #3b82f6;
    outline-offset: 1px;
  }

  .status {
    margin: 0;
    padding: 0 1.25rem 0.75rem;
    font-size: 0.875rem;
    color: #94a3b8;
  }

  .status.error {
    color: #f87171;
  }

  .status.muted {
    color: #64748b;
  }

  .issue-list {
    list-style: none;
    margin: 0;
    padding: 0 0.5rem;
    overflow-y: auto;
    flex: 1;
  }

  .issue-item {
    width: 100%;
    display: grid;
    gap: 0.125rem;
    padding: 0.75rem;
    margin-bottom: 0.25rem;
    border: 1px solid transparent;
    border-radius: 8px;
    background: transparent;
    color: inherit;
    text-align: left;
    cursor: pointer;
  }

  .issue-item:hover,
  .issue-item.selected {
    background: rgba(59, 130, 246, 0.12);
    border-color: rgba(59, 130, 246, 0.35);
  }

  .issue-id {
    font-size: 0.75rem;
    font-weight: 700;
    color: #93c5fd;
    letter-spacing: 0.02em;
  }

  .issue-name {
    font-size: 0.95rem;
    color: #f8fafc;
  }

  .issue-meta {
    font-size: 0.75rem;
    color: #94a3b8;
  }

  .dialog-footer {
    padding: 0.75rem 1.25rem 1rem;
    border-top: 1px solid rgba(148, 163, 184, 0.15);
    font-size: 0.75rem;
    color: #64748b;
  }
</style>
