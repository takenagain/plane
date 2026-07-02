<script>
  import {
    GetLoginURL,
    TryAuthenticateFromWebview,
    SubmitWebviewCookies,
  } from "../../wailsjs/go/main/App.js";
  import { EventsOn } from "../../wailsjs/runtime/runtime.js";

  let { loginUrl = "" } = $props();

  let iframeSrc = $state("");
  let statusMessage = $state("Loading Plane sign-in…");
  let pollTimer;

  async function refreshLoginUrl() {
    try {
      iframeSrc = loginUrl || (await GetLoginURL());
    } catch (err) {
      statusMessage = String(err);
    }
  }

  async function probeLogin() {
    try {
      await TryAuthenticateFromWebview();
    } catch {
      // Login not complete yet; keep polling.
    }
  }

  async function syncDocumentCookies() {
    if (!document.cookie) {
      return;
    }

    try {
      await SubmitWebviewCookies(document.cookie);
    } catch {
      // HttpOnly session cookies are captured by the Go login proxy.
    }
  }

  function startPolling() {
    stopPolling();
    pollTimer = setInterval(async () => {
      await syncDocumentCookies();
      await probeLogin();
    }, 2500);
  }

  function stopPolling() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  $effect(() => {
    refreshLoginUrl();
    startPolling();

    let cancelLoginURL = () => {};
    try {
      if (window.runtime?.EventsOnMultiple) {
        cancelLoginURL = EventsOn("auth:login-url", (url) => {
          iframeSrc = `${url}/sign-in/`;
        });
      }
    } catch (err) {
      statusMessage = String(err);
    }

    return () => {
      stopPolling();
      cancelLoginURL();
    };
  });
</script>

<section class="login-shell" aria-label="Plane sign-in">
  <header class="login-header">
    <h1>Sign in to Plane</h1>
    <p>{statusMessage}</p>
  </header>

  {#if iframeSrc}
    <iframe
      class="login-frame"
      title="Plane sign-in"
      src={iframeSrc}
      sandbox="allow-forms allow-scripts allow-same-origin allow-popups allow-top-navigation"
    ></iframe>
  {:else}
    <p class="login-placeholder">Preparing login…</p>
  {/if}
</section>

<style>
  .login-shell {
    display: flex;
    flex-direction: column;
    height: 100vh;
    background: #0f172a;
    color: #e2e8f0;
  }

  .login-header {
    padding: 1rem 1.25rem;
    border-bottom: 1px solid rgba(148, 163, 184, 0.2);
    text-align: left;
  }

  .login-header h1 {
    margin: 0 0 0.25rem;
    font-size: 1.1rem;
  }

  .login-header p {
    margin: 0;
    color: #94a3b8;
    font-size: 0.9rem;
  }

  .login-frame {
    flex: 1;
    width: 100%;
    border: 0;
    background: #fff;
  }

  .login-placeholder {
    margin: auto;
    color: #94a3b8;
  }
</style>
