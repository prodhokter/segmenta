<script lang="ts">
  import {
    X,
    Settings,
    Folder,
    Sliders,
    Moon,
    Sun,
    Monitor,
    Layers,
    Gauge,
    FolderTree,
    Globe,
    Power,
    Minimize2,
    Check,
    FolderOpen
  } from 'lucide-svelte';
  import type { AppSettings } from '$lib/types';
  import { t, SUPPORTED_LANGUAGES, type LanguageCode, setLanguage, getLanguage } from '$lib/i18n';

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
  let autostart = $state(false);
  let minimizeToTray = $state(true);
  let showProgressDialog = $state(true);
  let language = $state<LanguageCode>(getLanguage());
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
      autostart = settings.autostart ?? false;
      minimizeToTray = settings.minimize_to_tray_on_close ?? true;
      showProgressDialog = settings.show_progress_dialog ?? true;
      language = (settings.language as LanguageCode) || getLanguage();
    } else if (!isOpen) {
      wasOpen = false;
    }
  });

  function handleSubmit(e: SubmitEvent) {
    e.preventDefault();
    setLanguage(language);
    onSave({
      download_dir: downloadDir.trim(),
      max_concurrent_downloads: Number(maxConcurrent) || 3,
      default_segments: Number(defaultSegments) || 8,
      speed_limit_kb: Number(speedLimitKb) || 0,
      theme,
      auto_categorize: autoCategorize,
      autostart,
      start_minimized: autostart,
      show_progress_dialog: showProgressDialog,
      minimize_to_tray_on_close: minimizeToTray,
      language,
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
  <div
    class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm transition-all"
    role="dialog"
    aria-modal="true"
    aria-labelledby="modal-settings-title"
  >
    <div class="bg-surface dark:bg-surface-dark rounded-2xl border border-border-light dark:border-border-dark shadow-2xl max-w-xl w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150 flex flex-col max-h-[90vh]">
      <!-- Modal Header -->
      <div class="p-4 sm:px-6 bg-surface-elevated dark:bg-surface-darkelevated border-b border-border-light dark:border-border-dark flex items-center justify-between shrink-0">
        <div class="flex items-center gap-3">
          <div class="w-9 h-9 rounded-xl bg-primary/10 dark:bg-primary/20 border border-primary/20 flex items-center justify-center text-primary dark:text-indigo-400 shadow-sm">
            <Settings class="w-4 h-4" />
          </div>
          <div>
            <h3 id="modal-settings-title" class="font-bold text-sm text-heading dark:text-white">{t('modal.settings.title', language)}</h3>
            <p class="text-xs text-subtle dark:text-zinc-400">{t('modal.settings.sub', language)}</p>
          </div>
        </div>
        <button
          type="button"
          onclick={onClose}
          class="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-zinc-800 text-subtle dark:text-zinc-400 hover:text-heading dark:hover:text-white transition-colors"
          aria-label={t('modal.settings.cancel', language)}
        >
          <X class="w-4 h-4" />
        </button>
      </div>

      <!-- Form Body -->
      <form onsubmit={handleSubmit} class="p-5 sm:p-6 space-y-4 overflow-y-auto flex-1">
        <!-- Language Selection (Bilingual / Multilingual) -->
        <div class="p-3.5 bg-surface-elevated dark:bg-surface-darkcard rounded-xl border border-border-light dark:border-border-dark">
          <label class="block text-xs font-bold text-heading dark:text-white mb-2.5 flex items-center gap-1.5">
            <Globe class="w-3.5 h-3.5 text-primary dark:text-indigo-400" /> {t('modal.settings.lang_label', language)}
          </label>
          <div class="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {#each SUPPORTED_LANGUAGES as langOpt}
              <button
                type="button"
                onclick={() => { language = langOpt.code; setLanguage(langOpt.code); }}
                class="flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-semibold transition-all {language === langOpt.code ? 'bg-primary text-white border-primary shadow-sm ring-2 ring-primary/30' : 'bg-surface dark:bg-surface-darkelevated border-border-light dark:border-border-dark text-body dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800'}"
              >
                <span class="text-sm">{langOpt.flag}</span>
                <span class="truncate">{langOpt.nativeName}</span>
                {#if language === langOpt.code}
                  <Check class="w-3 h-3 ml-auto shrink-0" />
                {/if}
              </button>
            {/each}
          </div>
        </div>

        <!-- Download Directory -->
        <div class="p-3.5 bg-surface-elevated dark:bg-surface-darkcard rounded-xl border border-border-light dark:border-border-dark">
          <label for="settings-dir" class="block text-xs font-bold text-heading dark:text-white mb-1.5 flex items-center gap-1.5">
            <Folder class="w-3.5 h-3.5 text-primary dark:text-indigo-400" /> {t('modal.settings.dir_label', language)}
          </label>
          <div class="flex gap-2">
            <input
              id="settings-dir"
              type="text"
              required
              bind:value={downloadDir}
              class="flex-1 px-3.5 py-2 text-xs bg-surface dark:bg-surface-dark rounded-lg border border-border-light dark:border-border-dark focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-heading dark:text-white font-mono"
            />
          </div>
        </div>

        <!-- Concurrency & Segments Grid -->
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div class="p-3.5 bg-surface-elevated dark:bg-surface-darkcard rounded-xl border border-border-light dark:border-border-dark">
            <label for="settings-concurrency" class="block text-xs font-bold text-heading dark:text-white mb-1 flex items-center justify-between">
              <span>{t('modal.settings.concurrency_label', language)}</span>
              <span class="font-mono text-primary dark:text-indigo-400 font-extrabold px-2 py-0.5 rounded bg-primary/10 dark:bg-primary/20">{maxConcurrent} Tasks</span>
            </label>
            <input
              id="settings-concurrency"
              type="range"
              min="1"
              max="10"
              step="1"
              bind:value={maxConcurrent}
              class="w-full accent-primary mt-2 cursor-pointer"
            />
            <span class="text-[11px] text-subtle dark:text-zinc-400 mt-1 block">{t('modal.settings.concurrency_sub', language)}</span>
          </div>

          <div class="p-3.5 bg-surface-elevated dark:bg-surface-darkcard rounded-xl border border-border-light dark:border-border-dark">
            <label for="settings-segments" class="block text-xs font-bold text-heading dark:text-white mb-1 flex items-center justify-between">
              <span>{t('modal.settings.default_segments_label', language)}</span>
              <span class="font-mono text-primary dark:text-indigo-400 font-extrabold px-2 py-0.5 rounded bg-primary/10 dark:bg-primary/20">{defaultSegments} Slices</span>
            </label>
            <input
              id="settings-segments"
              type="range"
              min="1"
              max="32"
              step="1"
              bind:value={defaultSegments}
              class="w-full accent-primary mt-2 cursor-pointer"
            />
            <span class="text-[11px] text-subtle dark:text-zinc-400 mt-1 block">{t('modal.settings.default_segments_sub', language)}</span>
          </div>
        </div>

        <!-- Speed Limit Presets -->
        <div class="p-3.5 bg-surface-elevated dark:bg-surface-darkcard rounded-xl border border-border-light dark:border-border-dark">
          <label class="block text-xs font-bold text-heading dark:text-white mb-2 flex items-center gap-1.5">
            <Gauge class="w-3.5 h-3.5 text-secondary" /> {t('modal.settings.speed_limit_label', language)}
          </label>
          <div class="grid grid-cols-3 sm:grid-cols-6 gap-2">
            {#each speedPresets as preset}
              <button
                type="button"
                onclick={() => (speedLimitKb = preset.value)}
                class="px-2 py-1.5 rounded-lg border text-xs font-semibold font-mono transition-all text-center {speedLimitKb === preset.value ? 'bg-primary text-white border-primary shadow-sm ring-1 ring-primary/40' : 'bg-surface dark:bg-surface-darkelevated border-border-light dark:border-border-dark text-body dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800'}"
              >
                {preset.label}
              </button>
            {/each}
          </div>
        </div>

        <!-- Theme Mode Selection -->
        <div class="p-3.5 bg-surface-elevated dark:bg-surface-darkcard rounded-xl border border-border-light dark:border-border-dark">
          <span class="block text-xs font-bold text-heading dark:text-white mb-2 flex items-center gap-1.5">
            <Sliders class="w-3.5 h-3.5 text-subtle dark:text-zinc-400" /> {t('modal.settings.theme_label', language)}
          </span>
          <div class="grid grid-cols-3 gap-2">
            <button
              type="button"
              onclick={() => (theme = 'light')}
              class="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-semibold transition-all {theme === 'light' ? 'bg-primary text-white border-primary shadow-sm ring-2 ring-primary/30' : 'bg-surface dark:bg-surface-darkelevated border-border-light dark:border-border-dark text-body dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800'}"
            >
              <Sun class="w-3.5 h-3.5" /> {t('modal.settings.theme_light', language)}
            </button>
            <button
              type="button"
              onclick={() => (theme = 'dark')}
              class="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-semibold transition-all {theme === 'dark' ? 'bg-primary text-white border-primary shadow-sm ring-2 ring-primary/30' : 'bg-surface dark:bg-surface-darkelevated border-border-light dark:border-border-dark text-body dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800'}"
            >
              <Moon class="w-3.5 h-3.5" /> {t('modal.settings.theme_dark', language)}
            </button>
            <button
              type="button"
              onclick={() => (theme = 'system')}
              class="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-semibold transition-all {theme === 'system' ? 'bg-primary text-white border-primary shadow-sm ring-2 ring-primary/30' : 'bg-surface dark:bg-surface-darkelevated border-border-light dark:border-border-dark text-body dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800'}"
            >
              <Monitor class="w-3.5 h-3.5" /> {t('modal.settings.theme_system', language)}
            </button>
          </div>
        </div>

        <!-- System & Startup Toggles -->
        <div class="space-y-2.5">
          <!-- Launch on Windows Startup Toggle -->
          <div class="p-3.5 bg-surface-elevated dark:bg-surface-darkcard rounded-xl border border-border-light dark:border-border-dark flex items-center justify-between">
            <div class="flex items-center gap-3">
              <div class="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 flex items-center justify-center text-primary dark:text-indigo-300">
                <Power class="w-4 h-4" />
              </div>
              <div>
                <div class="text-xs font-bold text-heading dark:text-white">{t('modal.settings.startup_title', language)}</div>
                <div class="text-[11px] text-subtle dark:text-zinc-400">{t('modal.settings.startup_sub', language)}</div>
              </div>
            </div>
            <label class="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                bind:checked={autostart}
                class="sr-only peer"
              />
              <div class="w-9 h-5 bg-slate-200 dark:bg-zinc-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"></div>
            </label>
          </div>

          <!-- Minimize to System Tray on Close Toggle -->
          <div class="p-3.5 bg-surface-elevated dark:bg-surface-darkcard rounded-xl border border-border-light dark:border-border-dark flex items-center justify-between">
            <div class="flex items-center gap-3">
              <div class="w-8 h-8 rounded-lg bg-cyan-50 dark:bg-cyan-950/60 flex items-center justify-center text-secondary dark:text-cyan-300">
                <Minimize2 class="w-4 h-4" />
              </div>
              <div>
                <div class="text-xs font-bold text-heading dark:text-white">{t('modal.settings.tray_title', language)}</div>
                <div class="text-[11px] text-subtle dark:text-zinc-400">{t('modal.settings.tray_sub', language)}</div>
              </div>
            </div>
            <label class="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                bind:checked={minimizeToTray}
                class="sr-only peer"
              />
              <div class="w-9 h-5 bg-slate-200 dark:bg-zinc-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-secondary"></div>
            </label>
          </div>

          <!-- Auto-Categorization Toggle -->
          <div class="p-3.5 bg-surface-elevated dark:bg-surface-darkcard rounded-xl border border-border-light dark:border-border-dark flex items-center justify-between">
            <div class="flex items-center gap-3">
              <div class="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
                <FolderTree class="w-4 h-4" />
              </div>
              <div>
                <div class="text-xs font-bold text-heading dark:text-white">{t('modal.settings.autocat_title', language)}</div>
                <div class="text-[11px] text-subtle dark:text-zinc-400">{t('modal.settings.autocat_sub', language)}</div>
              </div>
            </div>
            <label class="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                bind:checked={autoCategorize}
                class="sr-only peer"
              />
              <div class="w-9 h-5 bg-slate-200 dark:bg-zinc-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-600"></div>
            </label>
          </div>

          <!-- Standalone Download Progress Popup Dialog Toggle -->
          <div class="p-3.5 bg-surface-elevated dark:bg-surface-darkcard rounded-xl border border-border-light dark:border-border-dark flex items-center justify-between">
            <div class="flex items-center gap-3">
              <div class="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 flex items-center justify-center text-primary dark:text-indigo-400">
                <Layers class="w-4 h-4" />
              </div>
              <div>
                <div class="text-xs font-bold text-heading dark:text-white">{t('modal.settings.progress_popup_title', language)}</div>
                <div class="text-[11px] text-subtle dark:text-zinc-400">{t('modal.settings.progress_popup_sub', language)}</div>
              </div>
            </div>
            <label class="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                bind:checked={showProgressDialog}
                class="sr-only peer"
              />
              <div class="w-9 h-5 bg-slate-200 dark:bg-zinc-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"></div>
            </label>
          </div>
        </div>

        <!-- Footer Actions -->
        <div class="pt-3 flex items-center justify-end gap-2.5 border-t border-border-light dark:border-border-dark">
          <button
            type="button"
            onclick={onClose}
            class="px-4 py-2 text-xs font-semibold rounded-lg bg-surface dark:bg-surface-darkelevated border border-border-light dark:border-border-dark hover:bg-slate-100 dark:hover:bg-zinc-800 text-body dark:text-zinc-300 transition-colors"
          >
            {t('modal.settings.cancel', language)}
          </button>
          <button
            type="submit"
            class="px-5 py-2 text-xs font-bold rounded-lg bg-primary hover:bg-primary-hover text-white shadow-md shadow-primary/20 transition-all flex items-center gap-1.5"
          >
            <Check class="w-3.5 h-3.5" />
            {t('modal.settings.save', language)}
          </button>
        </div>
      </form>
    </div>
  </div>
{/if}
