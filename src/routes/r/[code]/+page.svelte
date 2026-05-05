<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();

  type ScreenState = 'form' | 'sending' | 'sent' | 'already' | 'closed';
  // Initial-only чтения через untrack: страница SSR-рендерится с фиксированным
  // data из server load, реактивность нам тут не нужна и Svelte 5 справедливо
  // предупредит без untrack.
  const survey = untrack(() => data.survey);
  const initialExpired = untrack(() => data.expired);
  let screen = $state<ScreenState>(initialExpired ? 'closed' : 'form');

  // ответы: questionId -> string[]
  let answers = $state<Record<string, string[]>>(
    Object.fromEntries(survey.questions.map((q) => [q.id, ['']]))
  );

  let errorMessage = $state<string | null>(null);
  let errorQuestionId = $state<string | null>(null);

  const VOTED_KEY = `voted:${survey.code}`;

  onMount(() => {
    if (screen === 'form' && typeof localStorage !== 'undefined') {
      if (localStorage.getItem(VOTED_KEY)) screen = 'already';
    }
  });

  function stripWhitespace(s: string): string {
    return s.replace(/\s+/g, '');
  }

  function onSingleInput(qid: string, value: string) {
    answers[qid][0] = stripWhitespace(value);
  }

  function onMultiInput(qid: string, idx: number, value: string) {
    answers[qid][idx] = stripWhitespace(value);
  }

  function maxFor(qid: string): number {
    const q = survey.questions.find((q) => q.id === qid);
    return q?.maxAnswers ?? 20;
  }

  function addWord(qid: string) {
    if (answers[qid].length < maxFor(qid)) answers[qid].push('');
  }

  function removeWord(qid: string, idx: number) {
    if (answers[qid].length > 1) answers[qid].splice(idx, 1);
  }

  function blockSpace(e: KeyboardEvent) {
    if (e.key === ' ' || e.code === 'Space') {
      e.preventDefault();
    }
  }

  async function submit() {
    errorMessage = null;
    errorQuestionId = null;

    const payload = {
      answers: survey.questions
        .map((q) => ({
          questionId: q.id,
          words: (answers[q.id] ?? []).map((w) => w.trim()).filter((w) => w.length > 0)
        }))
        .filter((a) => a.words.length > 0)
    };

    if (payload.answers.length === 0) {
      errorMessage = 'Заполни хотя бы один ответ';
      return;
    }

    screen = 'sending';
    try {
      const r = await fetch(`/api/surveys/${survey.code}/answer`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const body = await r.json().catch(() => null);

      if (r.ok) {
        try {
          localStorage.setItem(VOTED_KEY, '1');
        } catch {}
        screen = 'sent';
        return;
      }
      if (r.status === 409) {
        try {
          localStorage.setItem(VOTED_KEY, '1');
        } catch {}
        screen = 'already';
        return;
      }
      if (r.status === 410) {
        screen = 'closed';
        return;
      }
      errorQuestionId = body?.error?.questionId ?? null;
      errorMessage = body?.error?.message ?? `Ошибка ${r.status}`;
      screen = 'form';
    } catch (e) {
      errorMessage = (e as Error).message;
      screen = 'form';
    }
  }
</script>

<svelte:head><title>{survey.title ?? 'Опрос ' + survey.code}</title></svelte:head>

{#if screen === 'closed'}
  <div class="state state-closed">
    <div class="state-icon">⏳</div>
    <h1>Опрос завершён</h1>
    <p class="muted">Голосование больше не принимается.</p>
  </div>
{:else if screen === 'sent'}
  <div class="state state-sent">
    <div class="state-icon">✓</div>
    <h1>Спасибо!</h1>
    <p class="muted">Ваш ответ записан.</p>
  </div>
{:else if screen === 'already'}
  <div class="state state-already">
    <div class="state-icon">✓</div>
    <h1>Ты уже отвечал</h1>
    <p class="muted">Ваш ответ записан. Спасибо за участие!</p>
  </div>
{:else}
  <h1>{survey.title ?? 'Опрос'}</h1>

  <form
    onsubmit={(e) => {
      e.preventDefault();
      submit();
    }}
  >
    {#each survey.questions as q, i (q.id)}
      <fieldset class="question" class:has-error={errorQuestionId === q.id}>
        <legend>
          <span class="num">{i + 1}.</span>
          {q.text}
        </legend>

        {#if q.answerType === 'single'}
          <input
            class="input"
            type="text"
            value={answers[q.id][0] ?? ''}
            oninput={(e) => onSingleInput(q.id, e.currentTarget.value)}
            onkeydown={blockSpace}
            maxlength="50"
            placeholder="одно слово"
            autocomplete="off"
          />
          <div class="hint">Только одно слово, без пробелов</div>
        {:else}
          <div class="multi">
            {#each answers[q.id] as _, idx (idx)}
              <div class="row">
                <input
                  class="input"
                  type="text"
                  value={answers[q.id][idx] ?? ''}
                  oninput={(e) => onMultiInput(q.id, idx, e.currentTarget.value)}
                  onkeydown={blockSpace}
                  maxlength="50"
                  placeholder="слово"
                  autocomplete="off"
                />
                <button
                  type="button"
                  class="btn btn-ghost btn-sm mini"
                  onclick={() => removeWord(q.id, idx)}
                  disabled={answers[q.id].length === 1}
                  aria-label="Удалить слово"
                >
                  ×
                </button>
              </div>
            {/each}
            {#if answers[q.id].length < q.maxAnswers}
              <button type="button" class="btn btn-ghost btn-sm" onclick={() => addWord(q.id)}>
                + слово ({answers[q.id].length}/{q.maxAnswers})
              </button>
            {:else}
              <div class="hint">Максимум {q.maxAnswers} слов</div>
            {/if}
          </div>
        {/if}
      </fieldset>
    {/each}

    {#if errorMessage}
      <div class="alert alert-error">{errorMessage}</div>
    {/if}

    <button type="submit" class="btn btn-primary btn-lg" disabled={screen === 'sending'}>
      {screen === 'sending' ? 'Отправляем…' : 'Отправить'}
    </button>
  </form>
{/if}

<style>
  h1 {
    margin-bottom: var(--space-2);
  }
  .muted {
    color: var(--c-muted);
  }

  .state {
    text-align: center;
    padding: var(--space-12) 0;
  }
  .state-icon {
    font-size: 3.5rem;
    line-height: 1;
    margin-bottom: var(--space-4);
  }
  .state-sent .state-icon {
    color: var(--c-success);
  }
  .state-already .state-icon {
    color: var(--c-blue);
  }
  .state-closed .state-icon {
    color: var(--c-muted);
  }

  form {
    display: flex;
    flex-direction: column;
    gap: var(--space-6);
    margin-top: var(--space-8);
  }
  .question {
    background: var(--c-surface);
    border: 1px solid transparent;
    padding: var(--space-4);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-sm);
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    min-width: 0;
  }
  .question.has-error {
    border-color: var(--c-danger);
    background: var(--c-danger-bg);
  }
  legend {
    font-weight: 500;
    font-size: 1.0625rem;
    padding: 0;
    margin-bottom: var(--space-2);
  }
  .num {
    color: var(--c-muted);
    font-weight: 600;
    margin-right: var(--space-2);
  }
  .hint {
    color: var(--c-muted);
    font-size: 0.875rem;
  }
  .multi {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  .row {
    display: flex;
    gap: var(--space-2);
    align-items: stretch;
  }
  .row .input {
    flex: 1;
    min-width: 0;
  }
  .row .mini {
    flex-shrink: 0;
    min-width: 44px;
    padding: 0;
    font-size: 1.2rem;
    line-height: 1;
  }
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

  @media (max-width: 480px) {
    form {
      gap: var(--space-4);
    }
    .question {
      padding: var(--space-3);
    }
    legend {
      font-size: 1rem;
    }
    .btn-lg {
      width: 100%;
    }
    .row .mini {
      min-height: 44px;
    }
  }
</style>
