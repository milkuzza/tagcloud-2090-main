<script lang="ts">
  // Главная только для гостей: залогиненных редиректит на /my (см. +page.server.ts).
  // Декоративные слова — статичный набор с разными размерами/насыщенностью.
  const tags: { text: string; size: number; tone: 'navy' | 'muted' | 'subtle' }[] = [
    { text: 'школа', size: 1.6, tone: 'navy' },
    { text: 'опрос', size: 1.0, tone: 'muted' },
    { text: 'мнение', size: 1.3, tone: 'navy' },
    { text: 'настроение', size: 1.85, tone: 'navy' },
    { text: 'идея', size: 0.9, tone: 'subtle' },
    { text: 'класс', size: 1.1, tone: 'muted' },
    { text: 'проект', size: 1.4, tone: 'navy' },
    { text: 'команда', size: 1.0, tone: 'muted' },
    { text: 'отзыв', size: 1.25, tone: 'muted' },
    { text: '2090', size: 0.95, tone: 'subtle' },
    { text: 'голос', size: 1.55, tone: 'navy' },
    { text: 'анонимно', size: 1.0, tone: 'subtle' }
  ];
</script>

<svelte:head>
  <title>Облако тегов — Школа №2090</title>
</svelte:head>

<section class="hero">
  <div class="hero-content">
    <span class="eyebrow">Школа №2090</span>
    <h1>
      Анонимные опросы
      <span class="hl">в виде облака тегов.</span>
    </h1>
    <p class="lead">
      Соберите мнение класса или мероприятия за минуту. Каждый ответ — слово; чем чаще оно
      повторяется, тем крупнее в облаке.
    </p>

    <div class="cta-row">
      <a class="btn btn-primary btn-lg" href="/join">Пройти опрос</a>
      <a class="btn btn-ghost btn-lg" href="/login">Войти как организатор</a>
    </div>
  </div>

  <div class="cloud-preview" aria-hidden="true">
    {#each tags as t, i (i)}
      <span class="tag tag-{t.tone}" style="--s: {t.size}; --i: {i}">{t.text}</span>
    {/each}
  </div>
</section>

<section class="features">
  <div class="feat">
    <div class="feat-num">01</div>
    <h3>Без регистрации</h3>
    <p>Респондент переходит по ссылке или QR-коду — и вписывает ответ.</p>
  </div>
  <div class="feat">
    <div class="feat-num">02</div>
    <h3>В реальном времени</h3>
    <p>Облако обновляется по мере поступления ответов на дашборде.</p>
  </div>
  <div class="feat">
    <div class="feat-num">03</div>
    <h3>Результат на email</h3>
    <p>По окончании опроса агрегат и CSV придут вам на почту.</p>
  </div>
</section>

<style>
  .hero {
    padding: var(--space-8) 0 var(--space-16);
    display: grid;
    grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr);
    gap: var(--space-12);
    align-items: center;
  }
  .hero-content {
    min-width: 0;
  }
  .eyebrow {
    display: inline-block;
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    color: var(--c-muted);
    margin-bottom: var(--space-4);
  }
  h1 {
    font-size: clamp(2rem, 1.5rem + 2.4vw, 3.25rem);
    margin: 0 0 var(--space-4);
    line-height: 1.1;
  }
  h1 .hl {
    display: block;
    color: var(--c-muted);
    font-weight: 500;
  }
  .lead {
    color: var(--c-muted);
    font-size: 1.0625rem;
    max-width: 52ch;
    line-height: 1.6;
    margin: 0 0 var(--space-8);
  }
  .cta-row {
    display: flex;
    gap: var(--space-3);
    flex-wrap: wrap;
  }

  /* Декоративное облако — статика, без расчётов layout, чисто визуальный аксессуар */
  .cloud-preview {
    position: relative;
    height: 360px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-wrap: wrap;
    gap: 10px 14px;
    padding: var(--space-4);
    border: 1px solid var(--c-border);
    border-radius: var(--radius-lg);
    background: var(--c-bg);
    overflow: hidden;
    user-select: none;
  }
  .cloud-preview::before {
    content: '';
    position: absolute;
    inset: 0;
    background: radial-gradient(
      circle at 50% 50%,
      color-mix(in srgb, var(--c-blue) 8%, transparent),
      transparent 70%
    );
    pointer-events: none;
  }
  /* Каждая вариация задаёт свою итоговую прозрачность через --target-opacity,
     потому что animation-fill-mode: forwards закрепляет финальное значение
     keyframe в каскаде с приоритетом выше обычных стилей. */
  .tag {
    --target-opacity: 1;
    font-weight: 600;
    line-height: 1;
    font-size: calc(0.9rem * var(--s));
    letter-spacing: -0.02em;
    opacity: 0;
    transform: translateY(6px);
    animation: tagIn 600ms cubic-bezier(0.2, 0, 0, 1) forwards;
    animation-delay: calc(var(--i) * 60ms + 100ms);
  }
  .tag-navy {
    color: var(--c-navy);
  }
  .tag-muted {
    color: var(--c-text);
    --target-opacity: 0.7;
  }
  .tag-subtle {
    color: var(--c-subtle);
  }
  @keyframes tagIn {
    from {
      opacity: 0;
      transform: translateY(6px);
    }
    to {
      opacity: var(--target-opacity);
      transform: translateY(0);
    }
  }
  /* Не анимируем, если пользователь предпочитает не двигаться */
  @media (prefers-reduced-motion: reduce) {
    .tag {
      animation: none;
      transform: none;
      opacity: var(--target-opacity);
    }
  }

  /* Фичи под hero — лёгкий «тройной столбец» без иконок */
  .features {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: var(--space-8);
    padding: var(--space-8) 0;
    border-top: 1px solid var(--c-border);
  }
  .feat-num {
    font-family: var(--font-mono);
    font-size: 0.75rem;
    color: var(--c-subtle);
    letter-spacing: 0.1em;
    margin-bottom: var(--space-3);
  }
  .feat h3 {
    margin: 0 0 var(--space-2);
    font-size: 1rem;
    font-weight: 600;
  }
  .feat p {
    margin: 0;
    color: var(--c-muted);
    font-size: 0.9375rem;
    line-height: 1.55;
  }

  @media (max-width: 860px) {
    .hero {
      grid-template-columns: 1fr;
      gap: var(--space-8);
    }
    .cloud-preview {
      height: 280px;
      order: -1;
    }
  }
  @media (max-width: 640px) {
    .features {
      grid-template-columns: 1fr;
      gap: var(--space-6);
    }
    .cta-row .btn {
      width: 100%;
    }
  }
</style>
