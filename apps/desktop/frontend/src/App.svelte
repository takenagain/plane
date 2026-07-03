<script>
  import LoginWebview from "./components/LoginWebview.svelte";
  import WebsiteView from "./components/WebsiteView.svelte";
  import IssueSelectionDialog from "./components/IssueSelectionDialog.svelte";
  import WorkItemTiles from "./components/WorkItemTiles.svelte";
  import {
    GetAuthState,
    GetConfig,
    GetTimerState,
    GetCurrentUser,
    GetCurrentWorkspace,
    OpenLogin,
    StopTracking,
  } from "../wailsjs/go/main/App.js";
  import { EventsOn } from "../wailsjs/runtime/runtime.js";

  const VIEW_STORAGE_KEY = "plane-desktop-active-view";

  let authState = $state({ status: "login_required", login_url: "", plane_url: "" });
  let config = $state({ plane_url: "" });
  let timerState = $state({ is_active: false, issue_title: "", elapsed_seconds: 0 });
  let user = $state(null);
  let workspace = $state(null);
  let loadError = $state("");
  let issueDialogOpen = $state(false);
  let timerRefreshInterval = null;

  function loadSavedView() {
    const saved = localStorage.getItem(VIEW_STORAGE_KEY);
    return saved === "timer" ? "timer" : "website";
  }

  let activeView = $state(loadSavedView());

  const isAuthenticated = $derived(authState.status === "authenticated");
  const isTracking = $derived(Boolean(timerState?.is_active));

  function formatElapsed(totalSeconds) {
    const seconds = Math.max(0, totalSeconds || 0);
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return [h, m, s].map((n) => String(n).padStart(2, "0")).join(":");
  }

  async function stopTracking() {
    try {
      await StopTracking();
      await refresh();
    } catch (err) {
      loadError = String(err);
    }
  }

  function setActiveView(view) {
    activeView = view;
    localStorage.setItem(VIEW_STORAGE_KEY, view);
  }

  async function refresh() {
    try {
      authState = await GetAuthState();
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
    if (!isAuthenticated) {
      void showLogin();
      return;
    }
    issueDialogOpen = true;
  }

  function closeIssueDialog() {
    issueDialogOpen = false;
  }

  async function handleIssueSelected() {
    await refresh();
  }

  async function showLogin() {
    await OpenLogin();
    await refresh();
  }

  $effect(() => {
    void refresh();

    let cancelAuth = () => {};
    let cancelIssueSelection = () => {};

    try {
      if (window.runtime?.EventsOnMultiple) {
        cancelAuth = EventsOn("auth:state-changed", (state) => {
          authState = state;
          refresh();
        });

        cancelIssueSelection = EventsOn("open-issue-selection", () => {
          openIssueDialog();
        });
      } else {
        loadError = "Wails runtime not ready — restart the app.";
      }
    } catch (err) {
      loadError = String(err);
    }

    timerRefreshInterval = setInterval(async () => {
      if (authState.status !== "authenticated") {
        return;
      }
      try {
        timerState = await GetTimerState();
      } catch {
        // Ignore transient timer refresh errors.
      }
    }, 1000);

    return () => {
      cancelAuth();
      cancelIssueSelection();
      if (timerRefreshInterval) {
        clearInterval(timerRefreshInterval);
      }
    };
  });
</script>

{#if isAuthenticated}
  <div class="app-shell">
    <nav class="side-nav" aria-label="Main navigation">
      <p class="nav-title">Plane Desktop</p>
      <button
        class="nav-btn"
        class:active={activeView === "website"}
        type="button"
        onclick={() => setActiveView("website")}
      >
        Website
      </button>
      <button
        class="nav-btn"
        class:active={activeView === "timer"}
        type="button"
        onclick={() => setActiveView("timer")}
      >
        Time tracking
      </button>
    </nav>

    <div class="main-content">
      {#if activeView === "website"}
        <WebsiteView planeUrl={config?.plane_url} />
      {:else}
        <main class="shell">
          <header class="topbar">
            <div>
              <h1>Time Tracking</h1>
              <p class="subtitle">Connected to {config?.plane_url}</p>
            </div>
            {#if user}
              <p class="user-chip">{user.display_name || user.email}</p>
            {/if}
          </header>

          {#if loadError}
            <p class="error">{loadError}</p>
          {/if}

          <section class="panel">
            <h2>Current session</h2>
            {#if isTracking}
              <p class="timer-display">{formatElapsed(timerState.elapsed_seconds)}</p>
              <p class="tracking-title">{timerState.issue_title}</p>
              <button class="btn stop" type="button" onclick={stopTracking}>
                Stop tracking
              </button>
            {:else}
              <p>No active tracking session.</p>
              <button class="btn" type="button" onclick={openIssueDialog}>
                Start tracking
              </button>
            {/if}
            <button class="btn secondary" type="button" onclick={openIssueDialog}>
              Search issues
            </button>

            <WorkItemTiles {timerState} onTrackingChange={refresh} />
          </section>

          <button class="btn" type="button" onclick={refresh}>Refresh</button>
        </main>
      {/if}
    </div>
  </div>

  <IssueSelectionDialog
    open={issueDialogOpen}
    {workspace}
    onSelect={handleIssueSelected}
    onClose={closeIssueDialog}
  />
{:else}
  <main class="login-fallback">
    {#if loadError}
      <p class="error login-error">{loadError}</p>
    {/if}
    <LoginWebview loginUrl={authState.login_url ? `${authState.login_url}/sign-in/` : ""} />
  </main>
{/if}

<style>
  .app-shell {
    display: flex;
    width: 100%;
    height: 100vh;
    min-height: 100vh;
    background: #0f172a;
    color: #e2e8f0;
  }

  .side-nav {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    width: 11rem;
    flex-shrink: 0;
    padding: 1rem 0.75rem;
    border-right: 1px solid rgba(148, 163, 184, 0.2);
    background: #0b1220;
  }

  .nav-title {
    margin: 0 0 0.75rem;
    padding: 0 0.5rem;
    font-size: 0.8rem;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: #64748b;
  }

  .nav-btn {
    padding: 0.6rem 0.75rem;
    border: none;
    border-radius: 6px;
    background: transparent;
    color: #cbd5e1;
    text-align: left;
    cursor: pointer;
    font: inherit;
  }

  .nav-btn:hover {
    background: rgba(148, 163, 184, 0.12);
  }

  .nav-btn.active {
    background: rgba(59, 130, 246, 0.18);
    color: #bfdbfe;
  }

  .main-content {
    flex: 1;
    min-width: 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .shell {
    width: 100%;
    max-width: 720px;
    margin: 0 auto;
    padding: 1.5rem;
    color: #e2e8f0;
    text-align: left;
    overflow: auto;
  }

  .topbar {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 1rem;
    margin-bottom: 1.5rem;
  }

  h1 {
    margin: 0 0 0.25rem;
  }

  .subtitle {
    margin: 0;
    color: #94a3b8;
    font-size: 0.9rem;
  }

  .user-chip {
    margin: 0;
    padding: 0.35rem 0.75rem;
    border-radius: 999px;
    background: rgba(59, 130, 246, 0.15);
    color: #bfdbfe;
    font-size: 0.85rem;
  }

  .panel {
    background: rgba(255, 255, 255, 0.05);
    border-radius: 8px;
    padding: 1rem 1.25rem;
    margin-bottom: 1rem;
  }

  .panel h2 {
    margin: 0 0 0.5rem;
    font-size: 1rem;
    color: #94a3b8;
  }

  .timer-display {
    margin: 0.25rem 0;
    font-size: 2.25rem;
    font-variant-numeric: tabular-nums;
    font-weight: 600;
    letter-spacing: 0.02em;
  }

  .tracking-title {
    margin: 0 0 1rem;
    color: #cbd5e1;
  }

  .error {
    color: #f87171;
  }

  .btn {
    padding: 0.5rem 1.25rem;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    background: #3b82f6;
    color: white;
  }

  .btn.secondary {
    margin-top: 0.75rem;
    background: #334155;
  }

  .btn.stop {
    margin-top: 0.25rem;
    background: #dc2626;
  }

  .btn.stop:hover {
    background: #b91c1c;
  }

  .btn:hover {
    background: #2563eb;
  }

  .btn.secondary:hover {
    background: #475569;
  }

  .login-fallback {
    display: flex;
    flex-direction: column;
    min-height: 100vh;
    width: 100%;
    max-width: none;
    margin: 0;
    padding: 0;
  }

  .login-error {
    padding: 1rem 1.25rem;
  }
</style>
