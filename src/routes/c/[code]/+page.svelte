<script lang="ts">
  import { onMount, onDestroy, untrack } from 'svelte';
  import type { PageProps } from './$types';
  import type { CloudWord } from '$lib/types/cloud';
  import { buildWordCloudOptions } from '$lib/cloud';

  let { data }: PageProps = $props();
  const survey = $derived(data.survey);

  let canvas = $state<HTMLCanvasElement | null>(null);
  // Initial-only чтение через untrack: SSR-снапшот фиксирован, дальше
  // обновляем words только из poll-ответов /api/.../cloud.
  let words = $state<Record<string, CloudWord[]>>(untrack(() => ({ ...data.initialWords })));
  let activeIdx = $state(0);
  let pollHandle: ReturnType<typeof setInterval> | null = null;
  let stopped = $state(false);

  const activeQuestion = $derived(survey.questions[activeIdx] ?? survey.questions[0]);
  const activeWords = $derived(words[activeQuestion?.id] ?? []);
  const totalVotes = $derived(activeWords.reduce((s, [, c]) => s + c, 0));

  async function refresh(): Promise<void> {
    try {
      const r = await fetch(`/api/surveys/${survey.code}/cloud`, {
        headers: { Accept: 'application/json' }
      });
      if (!r.ok) return;
      const body = (await r.json()) as {
        words: Record<string, CloudWord[]>;
        status: string;
      };
      words = body.words ?? {};
      if (body.status !== 'active') {
        stopped = true;
        if (pollHandle) clearInterval(pollHandle);
        pollHandle = null;
      }
    } catch {
      /* offline / network blip — пропустим тик, попробуем в следующий */
    }
  }

  onMount(() => {
    // Поллинг — компромисс между свежестью данных и нагрузкой: 5с
    // достаточно для кейса «зашёл посмотреть после ответа», и при этом
    // не создаёт штормов SQL даже на больших опросах.
    if (survey.status === 'active') {
      pollHandle = setInterval(refresh, 5000);
    }
  });

  onDestroy(() => {
    if (pollHandle) clearInterval(pollHandle);
  });

  $effect(() => {
    if (!canvas) return;
    const list = activeWords;
    if (list.length === 0) {
      const ctx = canvas.getContext('2d');
      ctx?.clearRect(0, 0, canvas.width, canvas.height);
      ctx!.fillStyle = '#FFFFFF';
      ctx!.fillRect(0, 0, canvas.width, canvas.height);
      return;
    }
    let cancelled = false;
    void (async () => {
      const WordCloud = (await import('wordcloud')).default;
      if (cancelled) return;
      WordCloud(
        canvas!,
        buildWordCloudOptions(list, survey.colorScheme, survey.customPalette, {
          baseSize: 20,
          maxWords: survey.maxWords,
          allowVertical: survey.allowVertical
        })
      );
    })();
    return () => {
      cancelled = true;
    };
  });
</script>

<svelte:head>
  <title>Облако · {survey.title ?? survey.code}</title>
</svelte:head>

<section class="head">
  <h1>{survey.title ?? `Опрос ${survey.code}`}</h1>
  <p class="muted">
    {#if survey.status === 'active' && !stopped}
      Облако обновляется автоматически. Голосов в этом вопросе: {totalVotes}.
    {:else}
      Опрос завершён. Голосов в этом вопросе: {totalVotes}.
    {/if}
  </p>
</section>

{#if survey.questions.length > 1}
  <div class="tabs">
    {#each survey.questions as q, i (q.id)}
      <button
        type="button"
        class="tab"
        class:active={i === activeIdx}
        onclick={() => (activeIdx = i)}
      >
        {i + 1}. {q.text.length > 30 ? q.text.slice(0, 30) + '…' : q.text}
      </button>
    {/each}
  </div>
{/if}

<div class="active-question">{activeQuestion?.text}</div>

<div class="canvas-wrap">
  {#if activeWords.length === 0}
    <div class="empty">Пока нет ответов.</div>
  {/if}
  <canvas bind:this={canvas} width="1200" height="700"></canvas>
</div>

<style>
  .head {
    margin-bottom: var(--space-4);
  }
  .muted {
    color: var(--c-muted);
  }
  .tabs {
    display: flex;
    gap: var(--space-2);
    flex-wrap: wrap;
    margin: var(--space-3) 0;
  }
  .tab {
    border: 1px solid var(--c-border);
    background: var(--c-bg);
    color: var(--c-text);
    border-radius: var(--radius-md);
    padding: 6px 10px;
    font-size: 0.875rem;
    cursor: pointer;
  }
  .tab.active {
    background: var(--c-navy);
    color: white;
    border-color: var(--c-navy);
  }
  .active-question {
    font-weight: 500;
    margin: var(--space-2) 0 var(--space-3);
  }
  .canvas-wrap {
    position: relative;
    width: 100%;
    aspect-ratio: 12 / 7;
    border: 1px solid var(--c-border);
    border-radius: var(--radius-md);
    overflow: hidden;
    background: white;
  }
  .canvas-wrap canvas {
    width: 100%;
    height: 100%;
    display: block;
  }
  .empty {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    color: var(--c-muted);
  }
</style>
