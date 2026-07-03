<script>
  import { GetWebsiteURL } from "../../wailsjs/go/main/App.js";

  let { planeUrl = "" } = $props();

  let iframeSrc = $state("");
  let loadError = $state("");

  async function refreshWebsiteUrl() {
    try {
      const proxyUrl = await GetWebsiteURL();
      iframeSrc = proxyUrl || planeUrl || "";
      loadError = iframeSrc ? "" : "Plane URL is not configured.";
    } catch (err) {
      loadError = String(err);
    }
  }

  $effect(() => {
    void refreshWebsiteUrl();
  });
</script>

<section class="website-shell" aria-label="Plane web app">
  {#if loadError}
    <p class="website-error" role="alert">{loadError}</p>
  {:else if iframeSrc}
    <iframe
      class="website-frame"
      title="Plane"
      src={iframeSrc}
      sandbox="allow-forms allow-scripts allow-same-origin allow-top-navigation-by-user-activation"
    ></iframe>
  {:else}
    <p class="website-placeholder">Loading…</p>
  {/if}
</section>

<style>
  .website-shell {
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
    min-height: 0;
    background: #0f172a;
    color: #e2e8f0;
  }

  .website-frame {
    flex: 1;
    width: 100%;
    border: 0;
    background: #fff;
  }

  .website-placeholder,
  .website-error {
    margin: auto;
    padding: 1rem 1.25rem;
    color: #94a3b8;
  }

  .website-error {
    color: #f87171;
  }
</style>
