<script>
  import {
    GetMyIssues,
    StartTrackingIssue,
    StopTracking,
  } from "../../wailsjs/go/main/App.js";

  let { timerState = null, onTrackingChange = () => {} } = $props();

  let issues = $state([]);
  let loading = $state(false);
  let error = $state("");
  let actionIssueId = $state("");

  function issueIdentifier(issue) {
    if (issue.project__identifier && issue.sequence_id) {
      return `${issue.project__identifier}-${issue.sequence_id}`;
    }
    return issue.id;
  }

  function issueStatus(issue) {
    if (issue.state_detail?.name) {
      return issue.state_detail.name;
    }
    return issue.state || "";
  }

  function isTrackingIssue(issue) {
    return Boolean(
      timerState?.is_active &&
        timerState?.issue_id &&
        timerState.issue_id === issue.id,
    );
  }

  async function loadIssues() {
    loading = true;
    error = "";

    try {
      const results = await GetMyIssues();
      issues = results ?? [];
    } catch (err) {
      issues = [];
      error = String(err);
    } finally {
      loading = false;
    }
  }

  async function handleToggle(issue) {
    if (!issue?.id || !issue?.project_id) {
      error = "Issue is missing required fields";
      return;
    }

    actionIssueId = issue.id;
    error = "";

    try {
      if (isTrackingIssue(issue)) {
        await StopTracking();
      } else {
        if (timerState?.is_active) {
          await StopTracking();
        }
        await StartTrackingIssue(issue);
      }
      await onTrackingChange();
    } catch (err) {
      error = String(err);
    } finally {
      actionIssueId = "";
    }
  }

  $effect(() => {
    void loadIssues();
  });
</script>

<div class="tiles-section">
  <div class="tiles-header">
    <h3>Your work items</h3>
    <button class="refresh-btn" type="button" onclick={loadIssues} disabled={loading}>
      Refresh
    </button>
  </div>

  {#if error}
    <p class="status error">{error}</p>
  {:else if loading && issues.length === 0}
    <p class="status">Loading work items…</p>
  {:else if issues.length === 0}
    <p class="status muted">No open assigned work items.</p>
  {:else}
    <div class="tile-grid">
      {#each issues as issue (issue.id)}
        {@const tracking = isTrackingIssue(issue)}
        {@const busy = actionIssueId === issue.id}
        <article class="tile" class:active={tracking}>
          <div class="tile-body">
            <span class="tile-id">{issueIdentifier(issue)}</span>
            <h4 class="tile-title">{issue.name}</h4>
            {#if issueStatus(issue)}
              <span class="tile-status">{issueStatus(issue)}</span>
            {/if}
          </div>

          <button
            class="track-btn"
            type="button"
            class:stop={tracking}
            aria-label={tracking ? "Stop tracking" : "Start tracking"}
            title={tracking ? "Stop tracking" : "Start tracking"}
            disabled={busy}
            onclick={() => handleToggle(issue)}
          >
            {#if tracking}
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <rect fill="currentColor" x="6" y="6" width="12" height="12" rx="1" />
              </svg>
            {:else}
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path fill="currentColor" d="M8 5v14l11-7z" />
              </svg>
            {/if}
          </button>
        </article>
      {/each}
    </div>
  {/if}
</div>

<style>
  .tiles-section {
    margin-top: 1rem;
    padding-top: 1rem;
    border-top: 1px solid rgba(148, 163, 184, 0.15);
  }

  .tiles-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    margin-bottom: 0.75rem;
  }

  .tiles-header h3 {
    margin: 0;
    font-size: 0.875rem;
    font-weight: 600;
    color: #94a3b8;
  }

  .refresh-btn {
    border: none;
    border-radius: 6px;
    padding: 0.25rem 0.625rem;
    background: rgba(148, 163, 184, 0.12);
    color: #cbd5e1;
    font: inherit;
    font-size: 0.75rem;
    cursor: pointer;
  }

  .refresh-btn:hover:not(:disabled) {
    background: rgba(148, 163, 184, 0.22);
  }

  .refresh-btn:disabled {
    opacity: 0.6;
    cursor: default;
  }

  .status {
    margin: 0;
    font-size: 0.875rem;
    color: #94a3b8;
  }

  .status.error {
    color: #f87171;
  }

  .status.muted {
    color: #64748b;
  }

  .tile-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: 0.75rem;
  }

  .tile {
    position: relative;
    display: flex;
    flex-direction: column;
    min-height: 7.5rem;
    padding: 0.875rem;
    border-radius: 10px;
    border: 1px solid rgba(148, 163, 184, 0.18);
    background: rgba(15, 23, 42, 0.55);
  }

  .tile.active {
    border-color: rgba(59, 130, 246, 0.45);
    background: rgba(59, 130, 246, 0.1);
  }

  .tile-body {
    flex: 1;
    padding-right: 2.5rem;
  }

  .tile-id {
    display: block;
    font-size: 0.75rem;
    font-weight: 700;
    color: #93c5fd;
    letter-spacing: 0.02em;
  }

  .tile-title {
    margin: 0.25rem 0;
    font-size: 0.9rem;
    font-weight: 600;
    color: #f8fafc;
    line-height: 1.35;
  }

  .tile-status {
    display: inline-block;
    margin-top: 0.125rem;
    font-size: 0.75rem;
    color: #94a3b8;
  }

  .track-btn {
    position: absolute;
    right: 0.625rem;
    bottom: 0.625rem;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 2rem;
    height: 2rem;
    padding: 0;
    border: none;
    border-radius: 999px;
    background: #334155;
    color: #e2e8f0;
    cursor: pointer;
  }

  .track-btn:hover:not(:disabled) {
    background: #475569;
  }

  .track-btn.stop {
    background: #dc2626;
    color: #fff;
  }

  .track-btn.stop:hover:not(:disabled) {
    background: #b91c1c;
  }

  .track-btn:disabled {
    opacity: 0.65;
    cursor: default;
  }

  .track-btn svg {
    width: 1rem;
    height: 1rem;
  }
</style>
