<script lang="ts">
  import { X, Calendar, Clock, Moon, Sun, Plus, Link2, Folder, Layers, Timer } from 'lucide-svelte';
  import type { ScheduledTaskItem } from '$lib/types';

  interface Props {
    isOpen: boolean;
    scheduledTasks: ScheduledTaskItem[];
    defaultDownloadDir: string;
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

  let { isOpen, scheduledTasks, defaultDownloadDir, onClose, onSchedule }: Props = $props();

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
  <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
    <div class="bg-surface dark:bg-surface-dark rounded-2xl border border-border-light dark:border-border-dark shadow-2xl max-w-xl w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
      <!-- Modal Header -->
      <div class="p-4 bg-surface-elevated dark:bg-surface-darkelevated border-b border-border-light dark:border-border-dark flex items-center justify-between">
        <div class="flex items-center gap-2">
          <div class="w-8 h-8 rounded-lg bg-secondary-light dark:bg-cyan-950/60 flex items-center justify-center text-secondary dark:text-cyan-300">
            <Clock class="w-4 h-4" />
          </div>
          <div>
            <h3 class="font-bold text-sm text-heading dark:text-white">Download Scheduler</h3>
            <p class="text-xs text-subtle dark:text-slate-400">Off-peak & timed queue management</p>
          </div>
        </div>
        <button
          onclick={onClose}
          class="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-zinc-800 text-subtle dark:text-slate-400 hover:text-heading dark:hover:text-white transition-colors"
        >
          <X class="w-4 h-4" />
        </button>
      </div>

      <!-- Schedule Preset Tabs -->
      <div class="flex border-b border-border-light dark:border-border-dark bg-surface dark:bg-surface-dark px-5 pt-3 gap-3">
        <button
          type="button"
          onclick={setNightPreset}
          class="pb-2 text-xs font-semibold flex items-center gap-1.5 border-b-2 transition-all {mode === 'night' ? 'border-primary text-primary dark:text-indigo-400 font-bold' : 'border-transparent text-subtle dark:text-slate-400 hover:text-heading dark:hover:text-white'}"
        >
          <Moon class="w-3.5 h-3.5" /> Off-Peak / Night Mode (02:00 - 06:00)
        </button>
        <button
          type="button"
          onclick={() => (mode = 'custom')}
          class="pb-2 text-xs font-semibold flex items-center gap-1.5 border-b-2 transition-all {mode === 'custom' ? 'border-primary text-primary dark:text-indigo-400 font-bold' : 'border-transparent text-subtle dark:text-slate-400 hover:text-heading dark:hover:text-white'}"
        >
          <Calendar class="w-3.5 h-3.5" /> Custom Schedule
        </button>
      </div>

      <!-- Form Body -->
      <form onsubmit={handleSubmit} class="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
        <!-- URL Input -->
        <div>
          <label for="sched-url" class="block text-xs font-semibold text-heading dark:text-white mb-1 flex items-center gap-1.5">
            <Link2 class="w-3.5 h-3.5 text-primary dark:text-indigo-400" /> Source Download URL
          </label>
          <input
            id="sched-url"
            type="url"
            required
            placeholder="https://example.com/bigfile.zip"
            bind:value={url}
            class="w-full px-3.5 py-2 text-xs bg-surface dark:bg-zinc-900 rounded-lg border border-border-light dark:border-border-dark focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-heading dark:text-white placeholder-subtle dark:placeholder-zinc-500 font-mono"
          />
        </div>

        <!-- Target Filename & Segments -->
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label for="sched-filename" class="block text-xs font-semibold text-heading dark:text-white mb-1">Target Filename</label>
            <input
              id="sched-filename"
              type="text"
              placeholder="bigfile.zip (auto-detect)"
              bind:value={filename}
              class="w-full px-3 py-1.5 text-xs bg-surface dark:bg-zinc-900 rounded-lg border border-border-light dark:border-border-dark focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-heading dark:text-white placeholder-subtle dark:placeholder-zinc-500"
            />
          </div>

          <div>
            <label for="sched-segments" class="block text-xs font-semibold text-heading dark:text-white mb-1 flex items-center justify-between">
              <span>Slices</span>
              <span class="font-mono text-primary dark:text-indigo-400 font-bold">{segments} Segments</span>
            </label>
            <input
              id="sched-segments"
              type="range"
              min="1"
              max="32"
              step="1"
              bind:value={segments}
              class="w-full accent-primary mt-1.5"
            />
          </div>
        </div>

        <!-- Schedule Start & Stop Times -->
        <div class="p-3.5 bg-surface-elevated dark:bg-surface-darkelevated rounded-xl border border-border-light dark:border-border-dark space-y-3">
          <div class="text-xs font-bold text-heading dark:text-white flex items-center gap-1.5">
            <Timer class="w-3.5 h-3.5 text-secondary" /> Schedule Timing Rules
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label for="sched-start" class="block text-[11px] font-semibold text-subtle dark:text-slate-400 mb-1">Start Downloading At</label>
              <input
                id="sched-start"
                type="datetime-local"
                bind:value={startTime}
                class="w-full px-2.5 py-1.5 text-xs bg-surface dark:bg-zinc-900 rounded-lg border border-border-light dark:border-border-dark focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-heading dark:text-white font-mono"
              />
            </div>
            <div>
              <label for="sched-stop" class="block text-[11px] font-semibold text-subtle dark:text-slate-400 mb-1">Auto-Pause/Stop At (Optional)</label>
              <input
                id="sched-stop"
                type="datetime-local"
                bind:value={stopTime}
                class="w-full px-2.5 py-1.5 text-xs bg-surface dark:bg-zinc-900 rounded-lg border border-border-light dark:border-border-dark focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-heading dark:text-white font-mono"
              />
            </div>
          </div>
        </div>

        <!-- Scheduled Queue Overview -->
        {#if scheduledTasks.length > 0}
          <div class="pt-2">
            <div class="text-xs font-bold text-heading dark:text-white mb-2 flex items-center justify-between">
              <span>Currently Scheduled Items ({scheduledTasks.length})</span>
            </div>
            <div class="space-y-1.5 max-h-32 overflow-y-auto">
              {#each scheduledTasks as item}
                <div class="p-2 bg-surface-elevated dark:bg-surface-darkelevated rounded-lg border border-border-light dark:border-border-dark flex items-center justify-between text-xs">
                  <span class="truncate font-medium text-heading dark:text-white max-w-[200px]">{item.task.filename}</span>
                  <span class="text-[11px] text-subtle dark:text-slate-400 font-mono">
                    {item.rule.start_at ? new Date(item.rule.start_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Immediate'}
                  </span>
                </div>
              {/each}
            </div>
          </div>
        {/if}

        <!-- Footer Actions -->
        <div class="pt-2 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onclick={onClose}
            class="px-4 py-2 text-xs font-semibold rounded-lg bg-surface dark:bg-zinc-900 border border-border-light dark:border-border-dark hover:bg-slate-100 dark:hover:bg-zinc-800 text-body dark:text-slate-300 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            class="px-4 py-2 text-xs font-semibold rounded-lg bg-secondary hover:bg-secondary-hover text-white shadow-sm transition-colors flex items-center gap-1.5"
          >
            <Clock class="w-3.5 h-3.5" /> Schedule Download
          </button>
        </div>
      </form>
    </div>
  </div>
{/if}
