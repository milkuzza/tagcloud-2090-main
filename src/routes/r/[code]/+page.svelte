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
  const initialAlreadyVoted = untrack(() => data.alreadyVoted);
  let screen = $state<ScreenState>(
    initialExpired ? 'closed' : initialAlreadyVoted ? 'already' : 'form'
  );

  // Шаговый wizard: показываем по одному вопросу. После последнего —
  // submit накопленных ответов. Это требование правки №5: на странице
  // ответов один вопрос, одна-две кнопки в зависимости от типа.
  let currentIdx = $state(0);

  // ответы: questionId -> string[]
  let answers = $state<Record<string, string[]>>(
    Object.fromEntries(survey.questions.map((q) => [q.id, ['']]))
  );

  let errorMessage = $state<string | null>(null);
  let errorQuestionId = $state<string | null>(null);

  const VOTED_KEY = `voted:${survey.code}`;

  onMount(() => {
    // Серверный hasVoted уже мог поставить screen='already', но если
    // localStorage клиента уже знает, что отвечали — тоже учитываем
    // (на случай задержки Redis или окончания TTL voted-ключа).
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

  const currentQuestion = $derived(survey.questions[currentIdx]);
  const isLast = $derived(currentIdx === survey.questions.length - 1);

  /**
   * Валидация заполненности активного вопроса. Для single — есть слово,
   * для multi — есть хотя бы одно непустое слово. Это локальный pre-check;
   * сервер делает полную проверку и лимиты.
   */
  function validateCurrent(): string | null {
    const q = currentQuestion;
    if (!q) return null;
    const words = (answers[q.id] ?? []).map((w) => w.trim()).filter((w) => w.length > 0);
    if (words.length === 0) return 'Введите хотя бы одно слово';
    if (q.answerType === 'single' && words.length > 1) {
      return 'В этом вопросе допускается только одно слово';
    }
    return null;
  }

  /**
   * Кнопка «Ответить»: валидируем активный вопрос, переходим к следующему;
   * на последнем вопросе — отправляем накопленные ответы на сервер.
   */
  async function answerCurrent(): Promise<void> {
    errorMessage = null;
    errorQuestionId = null;
    const err = validateCurrent();
    if (err) {
      errorQuestionId = currentQuestion.id;
      errorMessage = err;
      return;
    }
    if (isLast) {
      await submit();
    } else {
      currentIdx += 1;
    }
  }

  /**
   * «Следующий вопрос» в multi: если поле пусто — пропускаем; если
   * заполнено — фиксируем (как «Ответить») и идём дальше. На последнем
   * вопросе кнопки нет, но если вызвалась — поведение совпадает.
   */
  async function nextOrSkip(): Promise<void> {
    errorMessage = null;
    errorQuestionId = null;
    if (isLast) {
      await submit();
      return;
    }
    currentIdx += 1;
  }

  async function submit(): Promise<void> {
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
    <a class="btn btn-primary" href={`/c/${survey.code}`}>Посмотреть облако</a>
  </div>
{:else if screen === 'sent' || screen === 'already'}
  <div class="state {screen === 'already' ? 'state-already' : 'state-sent'}">
    <div class="state-icon">✓</div>
    {#if screen === 'already'}
      <h1>Ты уже отвечал</h1>
      <p class="muted">Ваш ответ записан. Спасибо за участие!</p>
    {:else}
      <h1>Спасибо!</h1>
      <p class="muted">Ваш ответ записан.</p>
    {/if}
    <!-- Правка №2: кнопка перехода к просмотру облака. На /c/[code]
         реализовано переключение между облаками, если вопросов несколько. -->
    <a class="btn btn-primary" href={`/c/${survey.code}`}>Посмотреть облако</a>
  </div>
{:else}
  <h1>{survey.title ?? 'Опрос'}</h1>
  <p class="progress muted">
    Вопрос {currentIdx + 1} из {survey.questions.length}
  </p>

  {#key currentQuestion.id}
    <form
      onsubmit={(e) => {
        e.preventDefault();
        void answerCurrent();
      }}
    >
      <fieldset class="question" class:has-error={errorQuestionId === currentQuestion.id}>
        <legend>
          <span class="num">{currentIdx + 1}.</span>
          {currentQuestion.text}
        </legend>

        {#if currentQuestion.answerType === 'single'}
          <input
            class="input"
            type="text"
            value={answers[currentQuestion.id][0] ?? ''}
            oninput={(e) => onSingleInput(currentQuestion.id, e.currentTarget.value)}
            onkeydown={blockSpace}
            maxlength="50"
            placeholder="одно слово"
            autocomplete="off"
          />
          <div class="hint">Только одно слово, без пробелов</div>
        {:else}
          <div class="multi">
            {#each answers[currentQuestion.id] as _, idx (idx)}
              <div class="row">
                <input
                  class="input"
                  type="text"
                  value={answers[currentQuestion.id][idx] ?? ''}
                  oninput={(e) => onMultiInput(currentQuestion.id, idx, e.currentTarget.value)}
                  onkeydown={blockSpace}
                  maxlength="50"
                  placeholder="слово"
                  autocomplete="off"
                />
                <button
                  type="button"
                  class="btn btn-ghost btn-sm mini"
                  onclick={() => removeWord(currentQuestion.id, idx)}
                  disabled={answers[currentQuestion.id].length === 1}
                  aria-label="Удалить слово"
                >
                  ×
                </button>
              </div>
            {/each}
            {#if answers[currentQuestion.id].length < currentQuestion.maxAnswers}
              <button
                type="button"
                class="btn btn-ghost btn-sm"
                onclick={() => addWord(currentQuestion.id)}
              >
                + слово ({answers[currentQuestion.id].length}/{currentQuestion.maxAnswers})
              </button>
            {:else}
              <div class="hint">Максимум {currentQuestion.maxAnswers} слов</div>
            {/if}
          </div>
        {/if}
      </fieldset>

      {#if errorMessage}
        <div class="alert alert-error">{errorMessage}</div>
      {/if}

      <div class="actions">
        <!-- single = одна кнопка, multi = две (Ответить + Следующий вопрос).
             На последнем вопросе обе ведут к submit, на промежуточных —
             nextOrSkip перелистывает без жёсткой валидации. -->
        <button type="submit" class="btn btn-primary btn-lg" disabled={screen === 'sending'}>
          {screen === 'sending' ? 'Отправляем…' : isLast ? 'Ответить и завершить' : 'Ответить'}
        </button>
        {#if currentQuestion.answerType === 'multi' && !isLast}
          <button
            type="button"
            class="btn btn-ghost btn-lg"
            disabled={screen === 'sending'}
            onclick={() => void nextOrSkip()}
          >
            Следующий вопрос
          </button>
        {/if}
      </div>
    </form>
  {/key}
{/if}

<style>
  h1 {
    margin-bottom: var(--space-2);
  }
  .muted {
    color: var(--c-muted);
  }
  .progress {
    margin-bottom: var(--space-4);
    font-size: 0.95rem;
  }

  .state {
    text-align: center;
    padding: var(--space-12) 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-3);
  }
  .state-icon {
    font-size: 3.5rem;
    line-height: 1;
    margin-bottom: var(--space-2);
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
  .state .btn {
    margin-top: var(--space-3);
  }

  form {
    display: flex;
    flex-direction: column;
    gap: var(--space-6);
    margin-top: var(--space-4);
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
  .actions {
    display: flex;
    gap: var(--space-3);
    flex-wrap: wrap;
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
    .actions .btn-lg {
      flex: 1;
      width: 100%;
    }
    .row .mini {
      min-height: 44px;
    }
  }
</style>
