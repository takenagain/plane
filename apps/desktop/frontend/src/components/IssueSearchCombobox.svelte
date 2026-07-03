<script>
  import { SearchIssues } from "../../wailsjs/go/main/App.js";
  import { issueIdentifier, rankIssues } from "../lib/issueUtils.js";

  let {
    workspace = null,
    disabled = false,
    onSelect = () => {},
  } = $props();

  let query = $state("");
  let issues = $state([]);
  let loading = $state(false);
  let error = $state("");
  let selectedIndex = $state(0);
  let isOpen = $state(false);
  let searchTimer = null;
  let inputEl = $state(null);
  let listboxId = "issue-inline-listbox";

  const canSearch = $derived(Boolean(workspace?.slug));

  async function runSearch(searchQuery) {
    const trimmed = searchQuery.trim();
    if (!trimmed) {
      issues = [];
      loading = false;
      error = "";
      isOpen = false;
      return;
    }

    if (!canSearch) {
      issues = [];
      loading = false;
      error = "No workspace selected.";
      return;
    }

    loading = true;
    error = "";

    try {
      const results = await SearchIssues(trimmed);
      issues = rankIssues(results ?? [], trimmed);
      selectedIndex = 0;
      isOpen = issues.length > 0;
    } catch (err) {
      issues = [];
      isOpen = false;
      error = String(err);
    } finally {
      loading = false;
    }
  }

  function handleInput(event) {
    query = event.target.value;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => runSearch(query), 300);
  }

  function selectIssue(issue) {
    query = "";
    issues = [];
    isOpen = false;
    error = "";
    onSelect(issue);
  }

  function handleKeydown(event) {
    if (event.key === "ArrowDown" && issues.length > 0) {
      event.preventDefault();
      selectedIndex = Math.min(selectedIndex + 1, issues.length - 1);
      return;
    }

    if (event.key === "ArrowUp" && issues.length > 0) {
      event.preventDefault();
      selectedIndex = Math.max(selectedIndex - 1, 0);
      return;
    }

    if (event.key === "Enter" && issues[selectedIndex]) {
      event.preventDefault();
      selectIssue(issues[selectedIndex]);
      return;
    }

    if (event.key === "Escape") {
      isOpen = false;
    }
  }

  function handleBlur(event) {
    const next = event.relatedTarget;
    if (next?.closest?.(".combobox-root")) {
      return;
    }
    setTimeout(() => {
      isOpen = false;
    }, 120);
  }
</script>

<div class="combobox-root">
  <input
    bind:this={inputEl}
    class="search-input"
    type="search"
    role="combobox"
    aria-autocomplete="list"
    aria-expanded={isOpen}
    aria-controls={listboxId}
    aria-activedescendant={isOpen ? `${listboxId}-option-${selectedIndex}` : undefined}
    placeholder="Search work items by title or ID…"
    value={query}
    oninput={handleInput}
    onkeydown={handleKeydown}
    onfocus={() => {
      if (issues.length > 0) {
        isOpen = true;
      }
    }}
    onblur={handleBlur}
    disabled={disabled || !canSearch}
    autocomplete="off"
  />

  {#if error}
    <p class="status error">{error}</p>
  {:else if loading}
    <p class="status">Searching…</p>
  {:else if query.trim() && !loading && issues.length === 0 && !error}
    <p class="status">No open work items found.</p>
  {/if}

  {#if isOpen && issues.length > 0}
    <ul class="results" id={listboxId} role="listbox" aria-label="Search results">
      {#each issues as issue, index (issue.id)}
        <li role="presentation">
          <button
            id="{listboxId}-option-{index}"
            type="button"
            class="result-item"
            class:selected={index === selectedIndex}
            role="option"
            aria-selected={index === selectedIndex}
            onmousedown={(event) => event.preventDefault()}
            onclick={() => selectIssue(issue)}
          >
            <span class="result-id">{issueIdentifier(issue)}</span>
            <span class="result-name">{issue.name}</span>
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .combobox-root {
    position: relative;
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

  .search-input:focus {
    outline: 2px solid #3b82f6;
    outline-offset: 1px;
  }

  .search-input:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .status {
    margin: 0.5rem 0 0;
    font-size: 0.8rem;
    color: #94a3b8;
  }

  .status.error {
    color: #f87171;
  }

  .results {
    position: absolute;
    z-index: 20;
    top: calc(100% + 0.35rem);
    left: 0;
    right: 0;
    max-height: 16rem;
    overflow-y: auto;
    margin: 0;
    padding: 0.35rem;
    list-style: none;
    border-radius: 8px;
    border: 1px solid rgba(148, 163, 184, 0.2);
    background: #1e293b;
    box-shadow: 0 12px 32px rgba(0, 0, 0, 0.35);
  }

  .result-item {
    width: 100%;
    display: grid;
    gap: 0.125rem;
    padding: 0.625rem 0.75rem;
    border: 1px solid transparent;
    border-radius: 6px;
    background: transparent;
    color: inherit;
    text-align: left;
    cursor: pointer;
  }

  .result-item:hover,
  .result-item.selected {
    background: rgba(59, 130, 246, 0.12);
    border-color: rgba(59, 130, 246, 0.35);
  }

  .result-id {
    font-size: 0.75rem;
    font-weight: 700;
    color: #93c5fd;
  }

  .result-name {
    font-size: 0.9rem;
    color: #f8fafc;
  }
</style>
