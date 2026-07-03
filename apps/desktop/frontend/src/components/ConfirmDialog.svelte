<script>
  let {
    open = false,
    title = "Confirm",
    message = "",
    confirmLabel = "Confirm",
    cancelLabel = "Cancel",
    onConfirm = () => {},
    onCancel = () => {},
  } = $props();
</script>

{#if open}
  <div class="backdrop" role="presentation" onclick={(event) => {
    if (event.target === event.currentTarget) {
      onCancel();
    }
  }}>
    <div class="dialog" role="alertdialog" aria-labelledby="confirm-title" aria-describedby="confirm-message">
      <h2 id="confirm-title">{title}</h2>
      <p id="confirm-message">{message}</p>
      <div class="actions">
        <button class="btn secondary" type="button" onclick={onCancel}>{cancelLabel}</button>
        <button class="btn primary" type="button" onclick={onConfirm}>{confirmLabel}</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 1100;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1rem;
    background: rgba(15, 23, 42, 0.72);
  }

  .dialog {
    width: min(420px, 100%);
    padding: 1.25rem;
    border-radius: 12px;
    border: 1px solid rgba(148, 163, 184, 0.2);
    background: #1e293b;
    color: #e2e8f0;
    text-align: left;
  }

  h2 {
    margin: 0 0 0.5rem;
    font-size: 1.05rem;
  }

  p {
    margin: 0 0 1rem;
    color: #94a3b8;
    font-size: 0.9rem;
    line-height: 1.45;
  }

  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
  }

  .btn {
    padding: 0.45rem 0.9rem;
    border: none;
    border-radius: 6px;
    font: inherit;
    cursor: pointer;
  }

  .btn.secondary {
    background: #334155;
    color: #e2e8f0;
  }

  .btn.primary {
    background: #3b82f6;
    color: #fff;
  }
</style>
