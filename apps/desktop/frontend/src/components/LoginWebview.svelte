<script>
  import {
    GetLoginURL,
    TryAuthenticateFromWebview,
    SubmitWebviewCookies,
  } from "../../wailsjs/go/main/App.js";
  import { EventsOn } from "../../wailsjs/runtime/runtime.js";

  let { loginUrl = "" } = $props();

  let iframeSrc = $state("");
  let loadError = $state("");
  let pollTimer;

  async function refreshLoginUrl() {
    try {
      iframeSrc = loginUrl || (await GetLoginURL());
      loadError = "";
    } catch (err) {
      loadError = String(err);
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
        cancelLoginURL = EventsOn("auth:login-url", async () => {
          iframeSrc = await GetLoginURL();
        });
      }
    } catch (err) {
      loadError = String(err);
    }

    return () => {
      stopPolling();
      cancelLoginURL();
    };
  });
</script>

<section class="login-shell" aria-label="Plane sign-in">
  {#if loadError}
    <p class="login-error" role="alert">{loadError}</p>
  {/if}

  {#if iframeSrc}
    <iframe
      class="login-frame"
      title="Plane sign-in"
      src={iframeSrc}
      sandbox="allow-forms allow-scripts allow-same-origin allow-top-navigation-by-user-activation"
    ></iframe>
  {:else}
    <p class="login-placeholder">Loading…</p>
  {/if}
</section>

<style>
  .login-shell {
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100vh;
    min-height: 100vh;
    background: #0f172a;
    color: #e2e8f0;
  }

  .login-frame {
    flex: 1;
    width: 100%;
    border: 0;
    background: #fff;
  }

  .login-placeholder,
  .login-error {
    margin: auto;
    padding: 1rem 1.25rem;
    color: #94a3b8;
  }

  .login-error {
    color: #f87171;
  }
</style>
