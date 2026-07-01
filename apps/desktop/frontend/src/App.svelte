<script>
  import logo from "./assets/images/logo-universal.png";
  import { GetConfig, GetTimerState, GetCurrentUser } from "../wailsjs/go/main/App.js";

  let config = { plane_url: "" };
  let timerState = { is_active: false, issue_title: "", elapsed_secs: 0 };
  let user = null;
  let loadError = "";

  async function refresh() {
    try {
      config = await GetConfig();
      timerState = await GetTimerState();
      user = await GetCurrentUser();
      loadError = "";
    } catch (err) {
      loadError = String(err);
    }
  }

  refresh();
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
    {:else}
      <p>Not authenticated — webview login is not yet implemented.</p>
    {/if}
  </section>

  <section class="panel">
    <h2>Time Tracking</h2>
    {#if timerState?.is_active}
      <p>Tracking: {timerState.issue_title}</p>
      <p>Elapsed: {Math.floor((timerState.elapsed_seconds || 0) / 60)}m {(timerState.elapsed_seconds || 0) % 60}s</p>
    {:else}
      <p>No active tracking session.</p>
    {/if}
  </section>

  <button class="btn" onclick={refresh}>Refresh</button>
</main>

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

  .btn:hover {
    background: #2563eb;
  }
</style>
