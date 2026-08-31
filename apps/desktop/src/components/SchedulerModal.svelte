<script lang="ts">
  import { X, Calendar, Clock, Moon, Sun, Plus, Link2, Folder, Layers, Timer } from 'lucide-svelte';
  import type { ScheduledTaskItem } from '$lib/types';
  import { t, type LanguageCode } from '$lib/i18n';

  interface Props {
    isOpen: boolean;
    scheduledTasks: ScheduledTaskItem[];
    defaultDownloadDir: string;
    currentLang?: LanguageCode;
    onClose: () => void;
    onSchedule: (data: {
      url: string;
      filename: string;
      savePath: string;
      segments: number;
      startAt: string | null;
      stopAt: string | null;
    }) => void;
  }

  let {
    isOpen,
    scheduledTasks,
    defaultDownloadDir,
    currentLang = 'en',
    onClose,
    onSchedule
  }: Props = $props();

  let url = $state('');
  let filename = $state('');
  let savePath = $state('');
  let segments = $state(8);
  let mode = $state<'custom' | 'night'>('night');
  let startTime = $state('');
  let stopTime = $state('');
  let wasOpen = false;

  $effect(() => {
    if (isOpen && !wasOpen) {
      wasOpen = true;
      if (!savePath) {
        savePath = defaultDownloadDir || 'C:\\Downloads';
      }
      setNightPreset();
    } else if (!isOpen) {
      wasOpen = false;
    }
  });

  $effect(() => {
    if (url && !filename) {
      try {
        const u = new URL(url);
        const name = u.pathname.split('/').filter(Boolean).pop();
        if (name) {
          filename = decodeURIComponent(name);
        }
      } catch {
        // url parsing error - ignored
      }
    }
  });

  function formatLocalDateTime(d: Date): string {
    const pad = (n: number) => (n < 10 ? '0' + n : n);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function setNightPreset() {
    mode = 'night';
    const now = new Date();
    const nextNight = new Date(now);
    if (now.getHours() >= 2) {
      nextNight.setDate(nextNight.getDate() + 1);
    }
    nextNight.setHours(2, 0, 0, 0);
    startTime = formatLocalDateTime(nextNight);

    const nextMorning = new Date(nextNight);
    nextMorning.setHours(6, 0, 0, 0);
    stopTime = formatLocalDateTime(nextMorning);
  }

  function handleSubmit(e: SubmitEvent) {
    e.preventDefault();
    if (!url.trim()) return;

    let startIso: string | null = null;
    let stopIso: string | null = null;

    if (startTime) {
      try {
        startIso = new Date(startTime).toISOString();
      } catch {
        startIso = null;
      }
    }
    if (stopTime) {
      try {
        stopIso = new Date(stopTime).toISOString();
      } catch {
        stopIso = null;
      }
    }

    onSchedule({
      url: url.trim(),
      filename: filename.trim(),
      savePath: savePath.trim() || defaultDownloadDir || 'C:\\Downloads',
      segments: Number(segments) || 8,
      startAt: startIso,
      stopAt: stopIso,
    });

    url = '';
    filename = '';
    onClose();
  }
</script>

{#if isOpen}
  <div
    class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
    role="dialog"
    aria-modal="true"
    aria-labelledby="modal-sched-title"
  >
    <div class="bg-surface dark:bg-surface-dark rounded-2xl border border-border-light dark:border-border-dark shadow-2xl max-w-xl w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
      <!-- Modal Header -->
      <div class="p-4 sm:px-6 bg-surface-elevated dark:bg-surface-darkelevated border-b border-border-light dark:border-border-dark flex items-center justify-between">
        <div class="flex items-center gap-3">
          <div class="w-9 h-9 rounded-xl bg-secondary/10 dark:bg-secondary/20 border border-secondary/20 flex items-center justify-center text-secondary dark:text-cyan-300">
            <Clock class="w-5 h-5" />
          </div>
          <div>
            <h3 id="modal-sched-title" class="font-bold text-sm text-heading dark:text-white">{t('modal.sched.title', currentLang)}</h3>
            <p class="text-xs text-subtle dark:text-zinc-400">{t('modal.sched.sub', currentLang)}</p>
          </div>
        </div>
        <button
          type="button"
          onclick={onClose}
          class="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-zinc-800 text-subtle dark:text-zinc-400 hover:text-heading dark:hover:text-white transition-colors"
          aria-label={t('modal.add.cancel', currentLang)}
        >
          <X class="w-4 h-4" />
        </button>
      </div>

      <!-- Schedule Preset Tabs -->
      <div class="flex border-b border-border-light dark:border-border-dark bg-surface-elevated dark:bg-surface-darkcard px-5 pt-3 gap-3">
        <button
          type="button"
          onclick={setNightPreset}
          class="pb-2.5 text-xs font-bold flex items-center gap-1.5 border-b-2 transition-all {mode === 'night' ? 'border-primary text-primary dark:text-indigo-400' : 'border-transparent text-subtle dark:text-zinc-400 hover:text-heading dark:hover:text-white'}"
        >
          <Moon class="w-3.5 h-3.5" /> {t('modal.sched.offpeak', currentLang)}
        </button>
        <button
          type="button"
          onclick={() => (mode = 'custom')}
          class="pb-2.5 text-xs font-bold flex items-center gap-1.5 border-b-2 transition-all {mode === 'custom' ? 'border-primary text-primary dark:text-indigo-400' : 'border-transparent text-subtle dark:text-zinc-400 hover:text-heading dark:hover:text-white'}"
        >
          <Calendar class="w-3.5 h-3.5" /> {t('modal.sched.custom', currentLang)}
        </button>
      </div>

      <!-- Form Body -->
      <form onsubmit={handleSubmit} class="p-5 sm:p-6 space-y-4 max-h-[75vh] overflow-y-auto">
        <!-- URL Input -->
        <div>
          <label for="sched-url" class="block text-xs font-bold text-heading dark:text-white mb-1.5 flex items-center gap-1.5">
            <Link2 class="w-3.5 h-3.5 text-primary dark:text-indigo-400" /> {t('modal.sched.url', currentLang)}
          </label>
          <input
            id="sched-url"
            type="url"
            required
            placeholder="https://example.com/bigfile.zip"
            bind:value={url}
            class="w-full px-3.5 py-2 text-xs bg-surface dark:bg-surface-darkcard rounded-lg border border-border-light dark:border-border-dark focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-heading dark:text-white placeholder-subtle dark:placeholder-zinc-500 font-mono"
          />
        </div>

        <!-- Target Filename & Segments -->
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label for="sched-filename" class="block text-xs font-bold text-heading dark:text-white mb-1.5">{t('modal.sched.filename', currentLang)}</label>
            <input
              id="sched-filename"
              type="text"
              placeholder="bigfile.zip"
              bind:value={filename}
              class="w-full px-3.5 py-2 text-xs bg-surface dark:bg-surface-darkcard rounded-lg border border-border-light dark:border-border-dark focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-heading dark:text-white placeholder-subtle dark:placeholder-zinc-500 font-mono"
            />
          </div>

          <div>
            <label for="sched-segments" class="block text-xs font-bold text-heading dark:text-white mb-1.5 flex items-center justify-between">
              <span>{t('modal.sched.slices', currentLang)}</span>
              <span class="font-mono text-primary dark:text-indigo-400 font-extrabold px-2 py-0.5 rounded bg-primary/10 dark:bg-primary/20 text-xs">{segments} Slices</span>
            </label>
            <input
              id="sched-segments"
              type="range"
              min="1"
              max="32"
              step="1"
              bind:value={segments}
              class="w-full accent-primary mt-1.5 cursor-pointer"
            />
          </div>
        </div>

        <!-- Schedule Start & Stop Times -->
        <div class="p-3.5 bg-surface-elevated dark:bg-surface-darkcard rounded-xl border border-border-light dark:border-border-dark space-y-3">
          <div class="text-xs font-bold text-heading dark:text-white flex items-center gap-1.5">
            <Timer class="w-3.5 h-3.5 text-secondary" /> {t('modal.sched.timing_rules', currentLang)}
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label for="sched-start" class="block text-[11px] font-bold text-subtle dark:text-zinc-400 mb-1.5">{t('modal.sched.custom_start', currentLang)}</label>
              <input
                id="sched-start"
                type="datetime-local"
                bind:value={startTime}
                class="w-full px-2.5 py-1.5 text-xs bg-surface dark:bg-surface-dark rounded-lg border border-border-light dark:border-border-dark focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-heading dark:text-white font-mono"
              />
            </div>
            <div>
              <label for="sched-stop" class="block text-[11px] font-bold text-subtle dark:text-zinc-400 mb-1.5">{t('modal.sched.custom_stop', currentLang)}</label>
              <input
                id="sched-stop"
                type="datetime-local"
                bind:value={stopTime}
                class="w-full px-2.5 py-1.5 text-xs bg-surface dark:bg-surface-dark rounded-lg border border-border-light dark:border-border-dark focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-heading dark:text-white font-mono"
              />
            </div>
          </div>
        </div>

        <!-- Scheduled Queue Overview -->
        {#if scheduledTasks.length > 0}
          <div class="pt-2">
            <div class="text-xs font-bold text-heading dark:text-white mb-2 flex items-center justify-between">
              <span>{t('modal.sched.active_list', currentLang)} ({scheduledTasks.length})</span>
            </div>
            <div class="space-y-1.5 max-h-32 overflow-y-auto">
              {#each scheduledTasks as item}
                <div class="p-2.5 bg-surface-elevated dark:bg-surface-darkcard rounded-lg border border-border-light dark:border-border-dark flex items-center justify-between text-xs">
                  <span class="truncate font-semibold text-heading dark:text-white max-w-[200px]">{item.task.filename}</span>
                  <span class="text-[11px] text-subtle dark:text-zinc-400 font-mono">
                    {item.rule.start_at ? new Date(item.rule.start_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Immediate'}
                  </span>
                </div>
              {/each}
            </div>
          </div>
        {/if}

        <!-- Footer Actions -->
        <div class="pt-3 flex items-center justify-end gap-2.5 border-t border-border-light dark:border-border-dark">
          <button
            type="button"
            onclick={onClose}
            class="px-4 py-2 text-xs font-semibold rounded-lg bg-surface dark:bg-surface-darkcard border border-border-light dark:border-border-dark hover:bg-slate-100 dark:hover:bg-zinc-800 text-body dark:text-zinc-300 transition-colors"
          >
            {t('modal.add.cancel', currentLang)}
          </button>
          <button
            type="submit"
            class="px-5 py-2 text-xs font-bold rounded-lg bg-secondary hover:bg-secondary-hover text-white shadow-md shadow-secondary/20 transition-all flex items-center gap-1.5"
          >
            <Clock class="w-3.5 h-3.5" /> {t('modal.sched.submit', currentLang)}
          </button>
        </div>
      </form>
    </div>
  </div>
{/if}
