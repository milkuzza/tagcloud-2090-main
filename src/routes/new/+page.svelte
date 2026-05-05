<script lang="ts">
  import type { PageProps } from './$types';
  let { data }: PageProps = $props();

  type Question = { text: string; answerType: 'single' | 'multi'; maxAnswers: number };
  type CreateResult = {
    code: string;
    url: string;
    dashboardUrl: string;
    qrPngBase64: string;
    expiresAt: string;
  };

  let title = $state('');
  let caseSensitive = $state(false);
  let colorScheme = $state<'mono' | 'random' | 'custom'>('mono');
  let customPalette = $state<string[]>(['#0E2A5C']);
  let durationPreset = $state<'1h' | '1d' | '7d' | 'custom'>('1d');
  let customExpiresAt = $state('');
  let questions = $state<Question[]>([{ text: '', answerType: 'single', maxAnswers: 5 }]);

  let submitting = $state(false);
  let result = $state<CreateResult | null>(null);
  let errorMessage = $state<string | null>(null);

  function addQuestion() {
    questions.push({ text: '', answerType: 'single', maxAnswers: 5 });
  }

  function setAnswerType(i: number, t: 'single' | 'multi') {
    questions[i].answerType = t;
    // При переключении на multi выставляем безопасный дефолт, чтобы новый
    // лимит сразу попал в payload (на бэке он же подставится при отсутствии).
    if (t === 'multi' && (!questions[i].maxAnswers || questions[i].maxAnswers < 2)) {
      questions[i].maxAnswers = 5;
    }
  }
  function removeQuestion(i: number) {
    if (questions.length > 1) questions.splice(i, 1);
  }
  function addColor() {
    if (customPalette.length < 10) customPalette.push('#2D9FDA');
  }
  function removeColor(i: number) {
    if (customPalette.length > 1) customPalette.splice(i, 1);
  }

  function computeExpiresAt(): string {
    const now = Date.now();
    if (durationPreset === '1h') return new Date(now + 60 * 60 * 1000).toISOString();
    if (durationPreset === '1d') return new Date(now + 24 * 60 * 60 * 1000).toISOString();
    if (durationPreset === '7d') return new Date(now + 7 * 24 * 60 * 60 * 1000).toISOString();
    return new Date(customExpiresAt).toISOString();
  }

  async function submit() {
    submitting = true;
    errorMessage = null;
    try {
      const body = {
        title: title.trim() || undefined,
        caseSensitive,
        colorScheme,
        customPalette: colorScheme === 'custom' ? customPalette : undefined,
        expiresAt: computeExpiresAt(),
        questions: questions.map((q) => ({
          text: q.text.trim(),
          answerType: q.answerType,
          ...(q.answerType === 'multi' ? { maxAnswers: q.maxAnswers } : {})
        }))
      };
      const r = await fetch('/api/surveys', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await r.json();
      if (!r.ok) {
        const issue = data.error?.issues?.[0];
        errorMessage = issue
          ? `${issue.path?.join('.') ?? ''}: ${issue.message}`
          : (data.error?.message ?? `Ошибка ${r.status}`);
        return;
      }
      result = data;
    } catch (e) {
      errorMessage = (e as Error).message;
    } finally {
      submitting = false;
    }
  }

  let copyDoneCode = $state(false);

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      copyDoneCode = true;
      setTimeout(() => (copyDoneCode = false), 1500);
    } catch {}
  }
</script>

<svelte:head><title>Новый опрос — Облако тегов 2090</title></svelte:head>

{#if result}
  <h1>Опрос создан</h1>

  <section class="card share">
    <div class="share-info">
      <h2 class="share-h">Код опроса</h2>
      <div class="big-code">{result.code}</div>

      <h2 class="share-h">Ссылка на опрос</h2>
      <div class="link-row">
        <code>{result.url}</code>
        <button class="btn btn-ghost btn-sm" onclick={() => copy(result!.url)}>
          {copyDoneCode ? 'Скопировано' : 'Копировать'}
        </button>
      </div>
    </div>
    <img class="qr" src={result.qrPngBase64} alt="QR код" />
  </section>
{:else}
  <h1>Создать опрос</h1>
  <p class="muted">Результаты придут на <strong>{data.email}</strong> по истечении срока.</p>

  <form
    onsubmit={(e) => {
      e.preventDefault();
      submit();
    }}
  >
    <label>
      <span>Название (необязательно)</span>
      <input
        class="input"
        type="text"
        bind:value={title}
        maxlength="200"
        placeholder="Опрос по математике"
      />
    </label>

    <fieldset>
      <legend>Срок действия</legend>
      <div class="segmented" role="radiogroup" aria-label="Срок действия">
        {#each [['1h', '1 час'], ['1d', '1 день'], ['7d', '1 неделя'], ['custom', 'Дата']] as [v, label] (v)}
          <button
            type="button"
            class="seg"
            class:active={durationPreset === v}
            role="radio"
            aria-checked={durationPreset === v}
            onclick={() => (durationPreset = v as typeof durationPreset)}
          >
            {label}
          </button>
        {/each}
      </div>
      {#if durationPreset === 'custom'}
        <input class="input" type="datetime-local" bind:value={customExpiresAt} required />
      {/if}
    </fieldset>

    <fieldset>
      <legend>Цветовая схема</legend>
      <div class="segmented" role="radiogroup" aria-label="Цветовая схема">
        {#each [['mono', 'Чёрно-белая'], ['random', 'Случайные цвета'], ['custom', 'Своя палитра']] as [v, label] (v)}
          <button
            type="button"
            class="seg"
            class:active={colorScheme === v}
            role="radio"
            aria-checked={colorScheme === v}
            onclick={() => (colorScheme = v as typeof colorScheme)}
          >
            {label}
          </button>
        {/each}
      </div>
      {#if colorScheme === 'custom'}
        <div class="palette">
          {#each customPalette as _, i (i)}
            <div class="swatch">
              <input type="color" bind:value={customPalette[i]} aria-label="Цвет" />
              <input
                class="input swatch-hex"
                type="text"
                bind:value={customPalette[i]}
                pattern="^#[0-9A-Fa-f]{'{6}'}$"
                aria-label="HEX-код"
              />
              <button
                type="button"
                class="btn btn-ghost btn-sm swatch-remove"
                onclick={() => removeColor(i)}
                disabled={customPalette.length === 1}
                aria-label="Удалить цвет"
              >
                ×
              </button>
            </div>
          {/each}
          {#if customPalette.length < 10}
            <button type="button" class="btn btn-ghost btn-sm" onclick={addColor}>
              + Добавить цвет ({customPalette.length}/10)
            </button>
          {/if}
        </div>
      {/if}
    </fieldset>

    <fieldset>
      <legend>Вопросы ({questions.length})</legend>
      {#each questions as _, i (i)}
        <div class="question">
          <div class="q-head">
            <strong>Вопрос {i + 1}</strong>
            <button
              type="button"
              class="btn btn-ghost btn-sm"
              onclick={() => removeQuestion(i)}
              disabled={questions.length === 1}
              aria-label="Удалить вопрос"
            >
              ×
            </button>
          </div>
          <textarea
            class="input"
            bind:value={questions[i].text}
            required
            maxlength="500"
            placeholder="Опишите одним словом ваше настроение"
          ></textarea>
          <div class="segmented" role="radiogroup" aria-label="Тип ответа">
            {#each [['single', 'Одно слово'], ['multi', 'Несколько слов']] as [v, label] (v)}
              <button
                type="button"
                class="seg seg-sm"
                class:active={questions[i].answerType === v}
                role="radio"
                aria-checked={questions[i].answerType === v}
                onclick={() => setAnswerType(i, v as 'single' | 'multi')}
              >
                {label}
              </button>
            {/each}
          </div>
          {#if questions[i].answerType === 'multi'}
            <label class="max-answers">
              <span class="max-answers-label">Максимум ответов</span>
              <input
                class="input max-answers-input"
                type="number"
                min="1"
                max="200"
                step="1"
                inputmode="numeric"
                bind:value={questions[i].maxAnswers}
                required
              />
            </label>
          {/if}
        </div>
      {/each}
      <button type="button" class="btn btn-ghost" onclick={addQuestion}> + Добавить вопрос </button>
    </fieldset>

    <details class="advanced">
      <summary>Дополнительно</summary>
      <label class="check">
        <input type="checkbox" bind:checked={caseSensitive} />
        <span>Учитывать регистр (Россия и россия — разные слова)</span>
      </label>
    </details>

    {#if errorMessage}
      <div class="alert alert-error">{errorMessage}</div>
    {/if}

    <button type="submit" class="btn btn-primary btn-lg" disabled={submitting}>
      {submitting ? 'Создаём…' : 'Создать опрос'}
    </button>
  </form>
{/if}

<style>
  h1 {
    margin-bottom: var(--space-2);
  }
  .muted {
    color: var(--c-muted);
    margin-bottom: var(--space-8);
  }
  form {
    display: flex;
    flex-direction: column;
    gap: var(--space-6);
  }
  label {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  fieldset {
    border: 0;
    padding: var(--space-4);
    margin: 0;
    background: var(--c-surface);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-sm);
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }
  legend {
    font-weight: 600;
    color: var(--c-navy);
    padding: 0;
    margin-bottom: var(--space-2);
  }
  label > span {
    font-weight: 500;
    color: var(--c-text);
  }
  textarea.input {
    min-height: 60px;
    resize: vertical;
  }

  /* ─── Сегментированный контрол ──────────────────────── */
  .segmented {
    display: inline-flex;
    flex-wrap: wrap;
    gap: 4px;
    background: var(--c-bg);
    border: 1px solid var(--c-border);
    border-radius: var(--radius);
    padding: 4px;
  }
  .seg {
    flex: 1;
    min-width: 0;
    padding: 8px 14px;
    background: transparent;
    border: 0;
    border-radius: 6px;
    color: var(--c-muted);
    font: 500 0.875rem/1.2 inherit;
    cursor: pointer;
    white-space: nowrap;
    transition:
      background-color 120ms,
      color 120ms;
  }
  .seg:hover:not(.active) {
    background: var(--c-surface);
    color: var(--c-text);
  }
  .seg.active {
    background: var(--c-navy);
    color: #fff;
  }
  .seg-sm {
    padding: 6px 12px;
    font-size: 0.8125rem;
  }

  /* ─── Палитра ──────────────────────── */
  .palette {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    margin-top: var(--space-2);
  }
  .swatch {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }
  .swatch input[type='color'] {
    width: 40px;
    height: 36px;
    padding: 0;
    border: 1px solid var(--c-border);
    border-radius: var(--radius);
    cursor: pointer;
    background: transparent;
  }
  .swatch-hex {
    flex: 0 1 130px;
    font-family: var(--font-mono);
    font-size: 0.875rem;
  }
  .swatch-remove {
    padding: 6px 12px;
    font-size: 1.1rem;
    line-height: 1;
  }

  /* ─── Вопросы ──────────────────────── */
  .question {
    background: var(--c-bg);
    border: 1px solid var(--c-border);
    border-radius: var(--radius);
    padding: var(--space-3);
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }
  .q-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: var(--space-2);
  }
  .max-answers {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding-top: var(--space-2);
    border-top: 1px dashed var(--c-border);
  }
  .max-answers-label {
    font-size: 0.8125rem;
    font-weight: 500;
    color: var(--c-muted);
  }
  .max-answers-input {
    width: 88px;
    text-align: center;
  }
  .q-head strong {
    font-weight: 500;
  }

  /* ─── Результат ──────────────────────── */
  .share {
    display: flex;
    gap: var(--space-6);
    flex-wrap: wrap;
    align-items: flex-start;
    padding: var(--space-6);
  }
  .share-info {
    flex: 1;
    min-width: 240px;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  .share-h {
    font-size: 0.75rem;
    color: var(--c-muted);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    font-weight: 600;
    margin: 0 0 var(--space-1);
  }
  .big-code {
    font-size: 2.25rem;
    font-weight: 700;
    color: var(--c-navy);
    letter-spacing: 0.15em;
    font-family: var(--font-mono);
    margin-bottom: var(--space-4);
  }
  .link-row {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    margin-bottom: var(--space-4);
  }
  .link-row code {
    padding: var(--space-2);
    font-size: 0.875rem;
    word-break: break-all;
    line-height: 1.4;
  }
  .link-row .btn {
    align-self: flex-start;
  }
  .qr {
    width: 280px;
    height: 280px;
    image-rendering: pixelated;
    border: 1px solid var(--c-border);
    border-radius: var(--radius);
    background: #fff;
  }

  /* ─── Дополнительно ──────────────────────── */
  .advanced {
    background: var(--c-surface);
    border-radius: var(--radius);
    padding: var(--space-3) var(--space-4);
  }
  .advanced summary {
    cursor: pointer;
    color: var(--c-muted);
    font-size: 0.9375rem;
    user-select: none;
  }
  .advanced[open] summary {
    margin-bottom: var(--space-3);
  }
  .check {
    flex-direction: row;
    align-items: center;
    gap: var(--space-3);
    cursor: pointer;
  }
  .check input {
    width: 18px;
    height: 18px;
    accent-color: var(--c-navy);
  }

  /* ─── Алерт ──────────────────────── */
  .alert {
    padding: var(--space-3);
    border-radius: var(--radius);
    border: 1px solid;
    font-size: 0.95rem;
  }
  .alert-error {
    background: var(--c-danger-bg);
    color: var(--c-danger);
    border-color: var(--c-danger-border);
  }

  @media (max-width: 640px) {
    .seg {
      flex-basis: calc(50% - 4px);
    }
    .share {
      flex-direction: column-reverse;
      align-items: center;
    }
    .share-info {
      width: 100%;
    }
    .qr {
      width: 240px;
      height: 240px;
    }
  }
</style>
