<script>
  import LoginWebview from "./components/LoginWebview.svelte";
  import {
    GetAuthState,
    GetConfig,
    GetTimerState,
    GetCurrentUser,
    OpenLogin,
  } from "../wailsjs/go/main/App.js";
  import { EventsOn } from "../wailsjs/runtime/runtime.js";

  let authState = $state({ status: "login_required", login_url: "", plane_url: "" });
  let config = $state({ plane_url: "" });
  let timerState = $state({ is_active: false, issue_title: "", elapsed_seconds: 0 });
  let user = $state(null);
  let loadError = $state("");

  const isAuthenticated = $derived(authState.status === "authenticated");

  async function refresh() {
    try {
      authState = await GetAuthState();
      config = await GetConfig();
      timerState = await GetTimerState();
      user = await GetCurrentUser();
      loadError = "";
    } catch (err) {
      loadError = String(err);
    }
  }

  async function showLogin() {
    await OpenLogin();
    await refresh();
  }

  $effect(() => {
    refresh();

    const cancelAuth = EventsOn("auth:state-changed", (state) => {
      authState = state;
      refresh();
    });

    return () => {
      cancelAuth();
    };
  });
</script>

{#if isAuthenticated}
  <main class="shell">
    <header class="topbar">
      <div>
        <h1>Plane Desktop</h1>
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
      <h2>Time Tracking</h2>
      {#if timerState?.is_active}
        <p>Tracking: {timerState.issue_title}</p>
        <p>
          Elapsed: {Math.floor((timerState.elapsed_seconds || 0) / 60)}m
          {(timerState.elapsed_seconds || 0) % 60}s
        </p>
      {:else}
        <p>No active tracking session. Use the system tray to start tracking.</p>
      {/if}
    </section>

    <button class="btn" onclick={refresh}>Refresh</button>
  </main>
{:else}
  <LoginWebview loginUrl={authState.login_url ? `${authState.login_url}/sign-in/` : ""} />
{/if}

<style>
  .shell {
    max-width: 720px;
    margin: 0 auto;
    padding: 1.5rem;
    color: #e2e8f0;
    text-align: left;
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

  .btn:hover {
    background: #2563eb;
  }
</style>
