<script>
  import { onMount } from "svelte";
  import logo from "./assets/images/logo-universal.png";
  import IssueSelectionDialog from "./components/IssueSelectionDialog.svelte";
  import {
    GetConfig,
    GetTimerState,
    GetCurrentUser,
    GetCurrentWorkspace,
  } from "../wailsjs/go/main/App.js";
  import { EventsOn } from "../wailsjs/runtime/runtime.js";

  let config = { plane_url: "" };
  let timerState = { is_active: false, issue_title: "", elapsed_secs: 0 };
  let user = null;
  let workspace = null;
  let loadError = "";
  let issueDialogOpen = false;
  let timerRefreshInterval = null;

  async function refresh() {
    try {
      config = await GetConfig();
      timerState = await GetTimerState();
      user = await GetCurrentUser();
      workspace = await GetCurrentWorkspace();
      loadError = "";
    } catch (err) {
      loadError = String(err);
    }
  }

  function openIssueDialog() {
    issueDialogOpen = true;
  }

  function closeIssueDialog() {
    issueDialogOpen = false;
  }

  async function handleIssueSelected() {
    await refresh();
  }

  onMount(() => {
    refresh();

    const unsubscribe = EventsOn("open-issue-selection", () => {
      openIssueDialog();
    });

    timerRefreshInterval = setInterval(async () => {
      try {
        timerState = await GetTimerState();
      } catch {
        // Ignore transient timer refresh errors.
      }
    }, 1000);

    return () => {
      unsubscribe?.();
      if (timerRefreshInterval) {
        clearInterval(timerRefreshInterval);
      }
    };
  });
</script>

<main>
  <img alt="Plane logo" id="logo" src={logo} />
  <h1>Plane Desktop</h1>

  {#if loadError}
    <p class="error">{loadError}</p>
  {/if}

  <section class="panel">
    <h2>Configuration</h2>
    <p><strong>Instance:</strong> {config?.plane_url || "Not configured"}</p>
  </section>

  <section class="panel">
    <h2>Authentication</h2>
    {#if user}
      <p>Signed in as {user.display_name || user.email}</p>
      {#if workspace}
        <p>Workspace: {workspace.name}</p>
      {/if}
    {:else}
      <p>Not authenticated — sign in via Plane web or configure cookies for testing.</p>
    {/if}
  </section>

  <section class="panel">
    <h2>Time Tracking</h2>
    {#if timerState?.is_active}
      <p>Tracking: {timerState.issue_title}</p>
      <p>
        Elapsed: {Math.floor((timerState.elapsed_seconds || 0) / 60)}m
        {(timerState.elapsed_seconds || 0) % 60}s
      </p>
    {:else}
      <p>No active tracking session.</p>
    {/if}
    <button class="btn secondary" type="button" onclick={openIssueDialog}>
      Start tracking
    </button>
  </section>

  <button class="btn" type="button" onclick={refresh}>Refresh</button>
</main>

<IssueSelectionDialog
  open={issueDialogOpen}
  {workspace}
  onSelect={handleIssueSelected}
  onClose={closeIssueDialog}
/>

<style>
  main {
    max-width: 640px;
    margin: 0 auto;
    padding: 2rem;
    color: #e2e8f0;
  }

  #logo {
    display: block;
    width: 120px;
    margin: 0 auto 1rem;
  }

  h1 {
    text-align: center;
    margin-bottom: 1.5rem;
  }

  .panel {
    background: rgba(255, 255, 255, 0.05);
    border-radius: 8px;
    padding: 1rem 1.25rem;
    margin-bottom: 1rem;
    text-align: left;
  }

  .panel h2 {
    margin: 0 0 0.5rem;
    font-size: 1rem;
    color: #94a3b8;
  }

  .error {
    color: #f87171;
  }

  .btn {
    display: block;
    margin: 1.5rem auto 0;
    padding: 0.5rem 1.25rem;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    background: #3b82f6;
    color: white;
  }

  .btn.secondary {
    margin: 0.75rem 0 0;
    background: #334155;
  }

  .btn:hover {
    background: #2563eb;
  }

  .btn.secondary:hover {
    background: #475569;
  }
</style>
