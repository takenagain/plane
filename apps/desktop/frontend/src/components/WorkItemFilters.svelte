<script>
  import { EMPTY_FILTERS, hasActiveFilters, toggleFilterValue } from "../lib/issueUtils.js";

  let {
    options = null,
    filters = EMPTY_FILTERS,
    onChange = () => {},
  } = $props();

  const projectModules = $derived(
    filters.project
      ? (options?.modules ?? []).filter((item) => item.project_id === filters.project)
      : (options?.modules ?? []),
  );

  const projectCycles = $derived(
    filters.project
      ? (options?.cycles ?? []).filter((item) => item.project_id === filters.project)
      : (options?.cycles ?? []),
  );

  function update(patch) {
    onChange({ ...filters, ...patch });
  }

  function clearAll() {
    onChange({ ...EMPTY_FILTERS });
  }
</script>

<div class="filters">
  <div class="filters-row">
    <label class="filter-field">
      <span>Project</span>
      <select
        value={filters.project}
        onchange={(event) =>
          update({ project: event.target.value, module: "", cycle: "" })}
      >
        <option value="">All projects</option>
        {#each options?.projects ?? [] as project (project.id)}
          <option value={project.id}>{project.name}</option>
        {/each}
      </select>
    </label>

    <label class="filter-field">
      <span>Module</span>
      <select
        value={filters.module}
        onchange={(event) => update({ module: event.target.value })}
      >
        <option value="">All modules</option>
        {#each projectModules as module (module.id)}
          <option value={module.id}>{module.name}</option>
        {/each}
      </select>
    </label>

    <label class="filter-field">
      <span>Cycle</span>
      <select
        value={filters.cycle}
        onchange={(event) => update({ cycle: event.target.value })}
      >
        <option value="">All cycles</option>
        {#each projectCycles as cycle (cycle.id)}
          <option value={cycle.id}>{cycle.name}</option>
        {/each}
      </select>
    </label>

    <label class="filter-field">
      <span>Assignee</span>
      <select
        value={filters.assignees?.[0] ?? ""}
        onchange={(event) => {
          const value = event.target.value;
          update({ assignees: value ? [value] : [] });
        }}
      >
        <option value="">Assigned to me</option>
        {#each options?.members ?? [] as member (member.id)}
          <option value={member.id}>{member.display_name}</option>
        {/each}
      </select>
    </label>
  </div>

  <div class="chip-row" role="group" aria-label="Priority filters">
    <span class="chip-label">Priority</span>
    {#each options?.priorities ?? [] as priority (priority)}
      <button
        type="button"
        class="chip"
        class:active={filters.priority?.includes(priority)}
        onclick={() => update({ priority: toggleFilterValue(filters.priority, priority) })}
      >
        {priority}
      </button>
    {/each}
  </div>

  <div class="chip-row" role="group" aria-label="State filters">
    <span class="chip-label">State</span>
    {#each options?.state_groups ?? [] as group (group)}
      {#if group !== "completed" && group !== "cancelled"}
        <button
          type="button"
          class="chip"
          class:active={filters.state_group?.includes(group)}
          onclick={() => update({ state_group: toggleFilterValue(filters.state_group, group) })}
        >
          {group}
        </button>
      {/if}
    {/each}
  </div>

  {#if hasActiveFilters(filters)}
    <button class="clear-btn" type="button" onclick={clearAll}>Clear filters</button>
  {/if}
</div>

<style>
  .filters {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    margin-bottom: 0.75rem;
  }

  .filters-row {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
    gap: 0.5rem;
  }

  .filter-field {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    font-size: 0.75rem;
    color: #94a3b8;
  }

  .filter-field select {
    padding: 0.45rem 0.55rem;
    border: 1px solid rgba(148, 163, 184, 0.22);
    border-radius: 6px;
    background: #0f172a;
    color: #e2e8f0;
    font: inherit;
    font-size: 0.8rem;
  }

  .chip-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.35rem;
  }

  .chip-label {
    font-size: 0.75rem;
    color: #64748b;
    margin-right: 0.25rem;
  }

  .chip {
    padding: 0.2rem 0.55rem;
    border: 1px solid rgba(148, 163, 184, 0.2);
    border-radius: 999px;
    background: rgba(148, 163, 184, 0.08);
    color: #cbd5e1;
    font: inherit;
    font-size: 0.75rem;
    cursor: pointer;
    text-transform: capitalize;
  }

  .chip.active {
    border-color: rgba(59, 130, 246, 0.45);
    background: rgba(59, 130, 246, 0.18);
    color: #bfdbfe;
  }

  .clear-btn {
    align-self: flex-start;
    padding: 0.25rem 0.5rem;
    border: none;
    border-radius: 6px;
    background: transparent;
    color: #93c5fd;
    font: inherit;
    font-size: 0.75rem;
    cursor: pointer;
  }

  .clear-btn:hover {
    text-decoration: underline;
  }
</style>
