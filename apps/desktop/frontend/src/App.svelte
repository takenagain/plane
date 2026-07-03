<script>
  import LoginWebview from "./components/LoginWebview.svelte";
  import WebsiteView from "./components/WebsiteView.svelte";
  import WorkItemTiles from "./components/WorkItemTiles.svelte";
  import WorkItemCard from "./components/WorkItemCard.svelte";
  import IssueSearchCombobox from "./components/IssueSearchCombobox.svelte";
  import {
    GetAuthState,
    GetConfig,
    GetTimerState,
    GetCurrentUser,
    GetCurrentWorkspace,
    GetIssueTotalTime,
    GetMyIssues,
    OpenLogin,
    StartTrackingIssue,
    StopTracking,
  } from "../wailsjs/go/main/App.js";
  import { EventsOn } from "../wailsjs/runtime/runtime.js";
  import { EMPTY_FILTERS, formatElapsed } from "./lib/issueUtils.js";

  const VIEW_STORAGE_KEY = "plane-desktop-active-view";

  let authState = $state({ status: "login_required", login_url: "", plane_url: "" });
  let config = $state({ plane_url: "" });
  let timerState = $state({ is_active: false, issue_title: "", elapsed_seconds: 0 });
  let user = $state(null);
  let workspace = $state(null);
  let loadError = $state("");
  let listFilters = $state({ ...EMPTY_FILTERS });
  let selectedIssue = $state(null);
  let activeIssue = $state(null);
  let selectedTotalSeconds = $state(0);
  let activeTotalSeconds = $state(0);
  let sessionBusy = $state(false);
  let timerRefreshInterval = null;

  function loadSavedView() {
    const saved = localStorage.getItem(VIEW_STORAGE_KEY);
    return saved === "timer" ? "timer" : "website";
  }

  let activeView = $state(loadSavedView());

  const isAuthenticated = $derived(authState.status === "authenticated");
  const isTracking = $derived(Boolean(timerState?.is_active));

  async function loadIssueTotal(issue) {
    if (!issue?.project_id || !issue?.id) {
      return 0;
    }
    try {
      return await GetIssueTotalTime(issue.project_id, issue.id);
    } catch {
      return issue.time_logged ?? 0;
    }
  }

  async function syncActiveIssue() {
    if (!isTracking || !timerState?.issue_id) {
      activeIssue = null;
      activeTotalSeconds = 0;
      return;
    }

    if (activeIssue?.id === timerState.issue_id) {
      return;
    }

    try {
      const issues = await GetMyIssues({ ...EMPTY_FILTERS, limit: 100 });
      const match = issues.find((issue) => issue.id === timerState.issue_id);
      activeIssue = match ?? {
        id: timerState.issue_id,
        project_id: timerState.project_id,
        name: timerState.issue_title,
      };
      activeTotalSeconds = await loadIssueTotal(activeIssue);
    } catch {
      activeIssue = {
        id: timerState.issue_id,
        project_id: timerState.project_id,
        name: timerState.issue_title,
      };
      activeTotalSeconds = 0;
    }
  }

  async function handleIssuePicked(issue) {
    selectedIssue = issue;
    selectedTotalSeconds = await loadIssueTotal(issue);
  }

  function clearSelectedIssue() {
    selectedIssue = null;
    selectedTotalSeconds = 0;
  }

  async function startSelectedTracking() {
    if (!selectedIssue) {
      return;
    }

    sessionBusy = true;
    loadError = "";

    try {
      await StartTrackingIssue(selectedIssue);
      clearSelectedIssue();
      await refresh();
    } catch (err) {
      loadError = String(err);
    } finally {
      sessionBusy = false;
    }
  }

  async function stopTracking() {
    sessionBusy = true;
    loadError = "";

    try {
      await StopTracking();
      clearSelectedIssue();
      await refresh();
    } catch (err) {
      loadError = String(err);
    } finally {
      sessionBusy = false;
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
      await syncActiveIssue();
    } catch (err) {
      loadError = String(err);
    }
  }

  async function showLogin() {
    await OpenLogin();
    await refresh();
  }

  $effect(() => {
    void refresh();

    let cancelAuth = () => {};

    try {
      if (window.runtime?.EventsOnMultiple) {
        cancelAuth = EventsOn("auth:state-changed", () => {
          refresh();
        });

        EventsOn("open-issue-selection", () => {
          setActiveView("timer");
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
        await syncActiveIssue();
      } catch {
        // Ignore transient timer refresh errors.
      }
    }, 1000);

    return () => {
      cancelAuth();
      if (timerRefreshInterval) {
        clearInterval(timerRefreshInterval);
      }
    };
  });

  $effect(() => {
    if (isTracking) {
      selectedIssue = null;
      selectedTotalSeconds = 0;
    }
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

            {#if isTracking && activeIssue}
              <WorkItemCard
                issue={activeIssue}
                totalSeconds={activeTotalSeconds}
                elapsedSeconds={timerState.elapsed_seconds}
                isActive={true}
              />
              <div class="session-actions">
                <button
                  class="btn stop"
                  type="button"
                  disabled={sessionBusy}
                  onclick={stopTracking}
                >
                  Stop tracking
                </button>
              </div>
            {:else if selectedIssue}
              <WorkItemCard issue={selectedIssue} totalSeconds={selectedTotalSeconds} />
              <div class="session-actions">
                <button
                  class="btn"
                  type="button"
                  disabled={sessionBusy}
                  onclick={startSelectedTracking}
                >
                  Start tracking
                </button>
                <button
                  class="btn secondary"
                  type="button"
                  disabled={sessionBusy}
                  onclick={clearSelectedIssue}
                >
                  Clear
                </button>
              </div>
            {:else}
              <IssueSearchCombobox
                {workspace}
                disabled={sessionBusy}
                onSelect={handleIssuePicked}
              />
              <div class="session-actions">
                <button class="btn" type="button" disabled>
                  Start tracking
                </button>
              </div>
            {/if}

            <WorkItemTiles
              {timerState}
              filters={listFilters}
              onFiltersChange={(next) => {
                listFilters = next;
              }}
              onTrackingChange={refresh}
            />
          </section>

          <button class="btn secondary refresh-all" type="button" onclick={refresh}>
            Refresh
          </button>
        </main>
      {/if}
    </div>
  </div>
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
    max-width: 820px;
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
    margin: 0 0 0.75rem;
    font-size: 1rem;
    color: #94a3b8;
  }

  .session-actions {
    display: flex;
    gap: 0.5rem;
    margin-top: 0.75rem;
    margin-bottom: 0.25rem;
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
    font: inherit;
  }

  .btn:disabled {
    opacity: 0.55;
    cursor: default;
  }

  .btn.secondary {
    background: #334155;
  }

  .btn.stop {
    background: #dc2626;
  }

  .btn.stop:hover:not(:disabled) {
    background: #b91c1c;
  }

  .btn:hover:not(:disabled) {
    background: #2563eb;
  }

  .btn.secondary:hover:not(:disabled) {
    background: #475569;
  }

  .refresh-all {
    margin-top: 0.25rem;
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
