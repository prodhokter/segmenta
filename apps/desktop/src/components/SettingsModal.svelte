<script lang="ts">
  import { X, Settings, Folder, Sliders, Moon, Sun, Monitor, Layers, Gauge, FolderTree } from 'lucide-svelte';
  import type { AppSettings } from '$lib/types';

  interface Props {
    isOpen: boolean;
    settings: AppSettings;
    onClose: () => void;
    onSave: (newSettings: AppSettings) => void;
  }

  let { isOpen, settings, onClose, onSave }: Props = $props();

  let downloadDir = $state('C:\\Downloads');
  let maxConcurrent = $state(3);
  let defaultSegments = $state(8);
  let speedLimitKb = $state(0);
  let theme = $state('system');
  let autoCategorize = $state(true);
  let wasOpen = false;

  $effect(() => {
    if (isOpen && !wasOpen && settings) {
      wasOpen = true;
      downloadDir = settings.download_dir || 'C:\\Downloads';
      maxConcurrent = settings.max_concurrent_downloads || 3;
      defaultSegments = settings.default_segments || 8;
      speedLimitKb = settings.speed_limit_kb || 0;
      theme = settings.theme || 'system';
      autoCategorize = settings.auto_categorize ?? true;
    } else if (!isOpen) {
      wasOpen = false;
    }
  });

  function handleSubmit(e: SubmitEvent) {
    e.preventDefault();
    onSave({
      download_dir: downloadDir.trim(),
      max_concurrent_downloads: Number(maxConcurrent) || 3,
      default_segments: Number(defaultSegments) || 8,
      speed_limit_kb: Number(speedLimitKb) || 0,
      theme,
      auto_categorize: autoCategorize,
    });
    onClose();
  }

  const speedPresets = [
    { label: 'Unlimited', value: 0 },
    { label: '1 MB/s', value: 1024 },
    { label: '5 MB/s', value: 5120 },
    { label: '10 MB/s', value: 10240 },
    { label: '25 MB/s', value: 25600 },
    { label: '50 MB/s', value: 51200 },
  ];
</script>

{#if isOpen}
  <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
    <div class="bg-surface rounded-2xl border border-border-light shadow-2xl max-w-lg w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
      <!-- Modal Header -->
      <div class="p-4 bg-surface-elevated border-b border-border-light flex items-center justify-between">
        <div class="flex items-center gap-2">
          <div class="w-8 h-8 rounded-lg bg-primary-light flex items-center justify-center text-primary">
            <Settings class="w-4 h-4" />
          </div>
          <div>
            <h3 class="font-bold text-sm text-heading">Preferences & Settings</h3>
            <p class="text-xs text-subtle">Configure download engine & interface</p>
          </div>
        </div>
        <button
          onclick={onClose}
          class="p-1.5 rounded-lg hover:bg-slate-200 text-subtle hover:text-heading transition-colors"
        >
          <X class="w-4 h-4" />
        </button>
      </div>

      <!-- Form Body -->
      <form onsubmit={handleSubmit} class="p-5 space-y-4 max-h-[80vh] overflow-y-auto">
        <!-- Download Directory -->
        <div>
          <label for="settings-dir" class="block text-xs font-semibold text-heading mb-1 flex items-center gap-1.5">
            <Folder class="w-3.5 h-3.5 text-primary" /> Default Download Directory
          </label>
          <input
            id="settings-dir"
            type="text"
            required
            bind:value={downloadDir}
            class="w-full px-3.5 py-2 text-xs bg-surface rounded-lg border border-border-light focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-heading font-mono"
          />
        </div>

        <!-- Concurrency & Segments Grid -->
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div class="p-3 bg-surface-elevated rounded-xl border border-border-light">
            <label for="settings-concurrency" class="block text-xs font-semibold text-heading mb-1 flex items-center justify-between">
              <span>Max Concurrent</span>
              <span class="font-mono text-primary font-bold">{maxConcurrent} Tasks</span>
            </label>
            <input
              id="settings-concurrency"
              type="range"
              min="1"
              max="10"
              step="1"
              bind:value={maxConcurrent}
              class="w-full accent-primary mt-2"
            />
            <span class="text-[11px] text-subtle mt-1 block">Parallel active downloads</span>
          </div>

          <div class="p-3 bg-surface-elevated rounded-xl border border-border-light">
            <label for="settings-segments" class="block text-xs font-semibold text-heading mb-1 flex items-center justify-between">
              <span>Default Segments</span>
              <span class="font-mono text-primary font-bold">{defaultSegments} Slices</span>
            </label>
            <input
              id="settings-segments"
              type="range"
              min="1"
              max="32"
              step="1"
              bind:value={defaultSegments}
              class="w-full accent-primary mt-2"
            />
            <span class="text-[11px] text-subtle mt-1 block">HTTP Range slices per task (1-32)</span>
          </div>
        </div>

        <!-- Speed Limit Presets -->
        <div>
          <label for="settings-speed-select" class="block text-xs font-semibold text-heading mb-1.5 flex items-center gap-1.5">
            <Gauge class="w-3.5 h-3.5 text-secondary" /> Global Speed Limit Presets
          </label>
          <div class="grid grid-cols-3 gap-2">
            {#each speedPresets as preset}
              <button
                type="button"
                onclick={() => (speedLimitKb = preset.value)}
                class="px-2.5 py-1.5 rounded-lg border text-xs font-semibold font-mono transition-all text-center {speedLimitKb === preset.value ? 'bg-primary text-white border-primary shadow-sm' : 'bg-surface border-border-light text-body hover:bg-slate-100'}"
              >
                {preset.label}
              </button>
            {/each}
          </div>
        </div>

        <!-- Theme Mode Selection -->
        <div>
          <span class="block text-xs font-semibold text-heading mb-1.5 flex items-center gap-1.5">
            <Sliders class="w-3.5 h-3.5 text-subtle" /> Interface Theme
          </span>
          <div class="grid grid-cols-3 gap-2">
            <button
              type="button"
              onclick={() => (theme = 'light')}
              class="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-semibold transition-all {theme === 'light' ? 'bg-primary text-white border-primary shadow-sm' : 'bg-surface border-border-light text-body hover:bg-slate-100'}"
            >
              <Sun class="w-3.5 h-3.5" /> Light
            </button>
            <button
              type="button"
              onclick={() => (theme = 'dark')}
              class="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-semibold transition-all {theme === 'dark' ? 'bg-primary text-white border-primary shadow-sm' : 'bg-surface border-border-light text-body hover:bg-slate-100'}"
            >
              <Moon class="w-3.5 h-3.5" /> Dark
            </button>
            <button
              type="button"
              onclick={() => (theme = 'system')}
              class="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-semibold transition-all {theme === 'system' ? 'bg-primary text-white border-primary shadow-sm' : 'bg-surface border-border-light text-body hover:bg-slate-100'}"
            >
              <Monitor class="w-3.5 h-3.5" /> System
            </button>
          </div>
        </div>

        <!-- Auto-Categorization Toggle -->
        <div class="p-3 bg-surface-elevated rounded-xl border border-border-light flex items-center justify-between">
          <div class="flex items-center gap-2.5">
            <div class="w-7 h-7 rounded-lg bg-secondary-light flex items-center justify-center text-secondary">
              <FolderTree class="w-4 h-4" />
            </div>
            <div>
              <div class="text-xs font-bold text-heading">Smart Auto-Categorization</div>
              <div class="text-[11px] text-subtle">Route files automatically to Video, Audio, Documents, etc.</div>
            </div>
          </div>
          <label class="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              bind:checked={autoCategorize}
              class="sr-only peer"
            />
            <div class="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"></div>
          </label>
        </div>

        <!-- Footer Actions -->
        <div class="pt-2 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onclick={onClose}
            class="px-4 py-2 text-xs font-semibold rounded-lg bg-surface border border-border-light hover:bg-slate-100 text-body transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            class="px-4 py-2 text-xs font-semibold rounded-lg bg-primary hover:bg-primary-hover text-white shadow-sm transition-colors"
          >
            Save Preferences
          </button>
        </div>
      </form>
    </div>
  </div>
{/if}
