<script>
  import {
    formatDueDate,
    formatDuration,
    issueIdentifier,
    issueStatus,
    priorityLabel,
  } from "../lib/issueUtils.js";

  let {
    issue = null,
    totalSeconds = 0,
    elapsedSeconds = 0,
    isActive = false,
    compact = false,
  } = $props();

  const displayTotal = $derived(
    isActive ? Math.max(totalSeconds, elapsedSeconds) : totalSeconds,
  );
</script>

{#if issue}
  <article class="card" class:compact class:active={isActive}>
    <div class="card-main">
      <span class="issue-id">{issueIdentifier(issue)}</span>
      <h3 class="issue-title">{issue.name}</h3>
      <div class="meta-row">
        {#if issueStatus(issue)}
          <span class="chip status">{issueStatus(issue)}</span>
        {/if}
        <span class="chip">{priorityLabel(issue.priority)}</span>
        <span class="chip muted">{formatDueDate(issue.target_date)}</span>
      </div>
    </div>
    <div class="time-block">
      <span class="time-label">Total tracked</span>
      <span class="time-value">{formatDuration(displayTotal)}</span>
      {#if isActive}
        <span class="live">Live session {formatDuration(elapsedSeconds)}</span>
      {/if}
    </div>
  </article>
{/if}

<style>
  .card {
    display: flex;
    justify-content: space-between;
    gap: 1rem;
    padding: 1rem 1.125rem;
    border-radius: 10px;
    border: 1px solid rgba(148, 163, 184, 0.2);
    background: rgba(15, 23, 42, 0.65);
  }

  .card.active {
    border-color: rgba(59, 130, 246, 0.45);
    background: rgba(59, 130, 246, 0.1);
  }

  .card.compact {
    padding: 0.875rem 1rem;
  }

  .card-main {
    min-width: 0;
    flex: 1;
  }

  .issue-id {
    display: block;
    font-size: 0.75rem;
    font-weight: 700;
    color: #93c5fd;
    letter-spacing: 0.02em;
  }

  .issue-title {
    margin: 0.25rem 0 0.5rem;
    font-size: 1rem;
    font-weight: 600;
    color: #f8fafc;
    line-height: 1.35;
  }

  .meta-row {
    display: flex;
    flex-wrap: wrap;
    gap: 0.375rem;
  }

  .chip {
    display: inline-flex;
    align-items: center;
    padding: 0.15rem 0.5rem;
    border-radius: 999px;
    background: rgba(148, 163, 184, 0.14);
    color: #cbd5e1;
    font-size: 0.75rem;
  }

  .chip.status {
    background: rgba(59, 130, 246, 0.18);
    color: #bfdbfe;
  }

  .chip.muted {
    color: #94a3b8;
  }

  .time-block {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    flex-shrink: 0;
    text-align: right;
  }

  .time-label {
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: #64748b;
  }

  .time-value {
    font-size: 1.25rem;
    font-variant-numeric: tabular-nums;
    font-weight: 600;
    color: #e2e8f0;
  }

  .live {
    margin-top: 0.25rem;
    font-size: 0.75rem;
    color: #86efac;
  }
</style>
