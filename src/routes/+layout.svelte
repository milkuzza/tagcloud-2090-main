<script lang="ts">
  import '../app.css';
  import { goto, invalidateAll } from '$app/navigation';
  let { children, data } = $props();

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    await invalidateAll();
    await goto('/');
  }
</script>

<header class="topbar">
  <div class="topbar-inner">
    <a class="brand" href={data.user ? '/my' : '/'}>
      <img class="brand-logo" src="/logo2090.png" alt="ГБОУ Школа №2090" />
      <span class="brand-text">Облако тегов</span>
    </a>

    <nav class="nav">
      {#if data.user}
        <button type="button" class="btn btn-ghost btn-sm" onclick={logout}>Выход</button>
      {:else}
        <a class="nav-link" href="/login">Войти</a>
      {/if}
    </nav>
  </div>
</header>

<main class="container">
  {@render children()}
</main>

<footer class="footer">
  <span>ГБОУ Школа №2090 · образовательный проект</span>
</footer>

<style>
  .topbar {
    position: sticky;
    top: 0;
    z-index: 50;
    border-bottom: 1px solid var(--c-border);
    background: color-mix(in srgb, var(--c-bg) 80%, transparent);
    backdrop-filter: saturate(140%) blur(12px);
    -webkit-backdrop-filter: saturate(140%) blur(12px);
  }
  .topbar-inner {
    max-width: 960px;
    margin: 0 auto;
    height: var(--header-h);
    padding: 0 var(--space-6);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-4);
  }
  .brand {
    display: inline-flex;
    align-items: center;
    gap: var(--space-3);
    color: var(--c-text);
    font-weight: 600;
    text-decoration: none;
    min-width: 0;
  }
  .brand:hover {
    color: var(--c-text);
    text-decoration: none;
  }
  .brand-logo {
    height: 36px;
    width: 36px;
    object-fit: contain;
    display: block;
    flex-shrink: 0;
    border-radius: 8px;
  }
  .brand-text {
    color: var(--c-text);
    font-weight: 600;
    font-size: 1rem;
    letter-spacing: -0.01em;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .nav {
    display: inline-flex;
    align-items: center;
    gap: var(--space-3);
  }
  .nav-link {
    color: var(--c-muted);
    font-weight: 500;
    font-size: 0.9375rem;
    text-decoration: none;
    white-space: nowrap;
    padding: 6px 4px;
    transition: color var(--transition);
  }
  .nav-link:hover {
    color: var(--c-text);
    text-decoration: none;
  }

  .container {
    max-width: 960px;
    margin: 0 auto;
    padding: var(--space-12) var(--space-6) var(--space-16);
    min-height: calc(100vh - var(--header-h) - 80px);
  }
  .footer {
    border-top: 1px solid var(--c-border);
    padding: var(--space-6);
    color: var(--c-subtle);
    font-size: 0.8125rem;
    text-align: center;
    letter-spacing: 0.01em;
  }

  @media (max-width: 640px) {
    .topbar-inner {
      padding: 0 var(--space-4);
    }
    .brand-logo {
      height: 32px;
      width: 32px;
    }
    .brand-text {
      font-size: 0.9375rem;
    }
    .container {
      padding: var(--space-8) var(--space-4) var(--space-12);
      min-height: calc(100vh - var(--header-h) - 100px);
    }
  }
</style>
