<script lang="ts">
  import { page } from '$app/state';
</script>

<svelte:head><title>{page.status} — Облако тегов 2090</title></svelte:head>

<div class="wrap">
  <div class="status">{page.status}</div>
  <h1>{page.error?.message ?? 'Что-то пошло не так'}</h1>
  <a href="/" class="btn btn-ghost">← На главную</a>
</div>

<style>
  .wrap {
    text-align: center;
    padding: var(--space-16) 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-2);
  }
  .status {
    font-size: clamp(4rem, 3rem + 4vw, 6rem);
    font-weight: 700;
    color: var(--c-text);
    letter-spacing: -0.05em;
    line-height: 1;
    margin-bottom: var(--space-2);
  }
  h1 {
    margin: 0 0 var(--space-8);
    color: var(--c-muted);
    font-weight: 500;
    font-size: 1.125rem;
    letter-spacing: 0;
  }
</style>
