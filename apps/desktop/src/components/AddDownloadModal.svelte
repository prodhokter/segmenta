<script lang="ts">
  import { X, Plus, Folder, Link2, Video, Check, Layers } from 'lucide-svelte';
  import type { VariantStream } from '$lib/types';
  import { t, type LanguageCode } from '$lib/i18n';

  interface Props {
    isOpen: boolean;
    defaultDownloadDir: string;
    defaultSegments: number;
    currentLang?: LanguageCode;
    onClose: () => void;
    onSubmit: (data: { url: string; filename: string; savePath: string; segments: number }) => void;
    onProbeM3u8?: (url: string) => Promise<VariantStream[]>;
  }

  let {
    isOpen,
    defaultDownloadDir,
    defaultSegments,
    currentLang = 'en',
    onClose,
    onSubmit,
    onProbeM3u8
  }: Props = $props();

  let url = $state('');
  let filename = $state('');
  let savePath = $state('');
  let segments = $state(8);
  let wasOpen = false;

  // HLS stream detection state
  let isHlsDetected = $state(false);
  let isProbingHls = $state(false);
  let hlsVariants: VariantStream[] = $state([]);
  let selectedVariantUrl = $state('');

  $effect(() => {
    if (isOpen && !wasOpen) {
      wasOpen = true;
      if (!savePath) savePath = defaultDownloadDir || 'C:\\Downloads';
      segments = defaultSegments || 8;
    } else if (!isOpen) {
      wasOpen = false;
    }
  });

  $effect(() => {
    if (url) {
      const cleanUrl = url.split('?')[0];
      const isM3u8 = cleanUrl.endsWith('.m3u8');
      isHlsDetected = isM3u8;

      if (!filename) {
        try {
          const u = new URL(url);
          const name = u.pathname.split('/').filter(Boolean).pop();
          if (name) {
            if (isM3u8 && name.endsWith('.m3u8')) {
              filename = decodeURIComponent(name.replace('.m3u8', '.ts'));
            } else {
              filename = decodeURIComponent(name);
            }
          }
        } catch {
          // url parsing error - ignored
        }
      }

      if (isM3u8 && onProbeM3u8 && hlsVariants.length === 0 && !isProbingHls) {
        probeVariants(url);
      }
    } else {
      isHlsDetected = false;
      hlsVariants = [];
      selectedVariantUrl = '';
    }
  });

  async function probeVariants(m3u8Url: string) {
    if (!onProbeM3u8) return;
    isProbingHls = true;
    try {
      const res = await onProbeM3u8(m3u8Url);
      if (res && res.length > 0) {
        hlsVariants = res;
        selectedVariantUrl = res[0].url;
      }
    } catch (e) {
      console.warn('Failed to probe M3U8 variants:', e);
    } finally {
      isProbingHls = false;
    }
  }

  function handleSelectVariant(vUrl: string) {
    selectedVariantUrl = vUrl;
  }

  function handleSubmit(e: SubmitEvent) {
    e.preventDefault();
    const targetUrl = selectedVariantUrl || url;
    if (!targetUrl.trim()) return;
    onSubmit({
      url: targetUrl.trim(),
      filename: filename.trim(),
      savePath: savePath.trim() || defaultDownloadDir || 'C:\\Downloads',
      segments: isHlsDetected ? 1 : (Number(segments) || 8),
    });
    url = '';
    filename = '';
    hlsVariants = [];
    selectedVariantUrl = '';
    onClose();
  }
</script>

{#if isOpen}
  <div
    class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
    role="dialog"
    aria-modal="true"
    aria-labelledby="modal-add-title"
  >
    <div class="bg-surface dark:bg-surface-dark rounded-2xl border border-border-light dark:border-border-dark shadow-2xl max-w-lg w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
      <!-- Modal Header -->
      <div class="p-4 sm:px-6 bg-surface-elevated dark:bg-surface-darkelevated border-b border-border-light dark:border-border-dark flex items-center justify-between">
        <div class="flex items-center gap-3">
          <div class="w-9 h-9 rounded-xl bg-primary/10 dark:bg-primary/20 border border-primary/20 flex items-center justify-center text-primary dark:text-indigo-400">
            <Plus class="w-5 h-5" />
          </div>
          <div>
            <h3 id="modal-add-title" class="font-bold text-sm text-heading dark:text-white">{t('modal.add.title', currentLang)}</h3>
            <p class="text-xs text-subtle dark:text-zinc-400">{t('modal.add.sub', currentLang)}</p>
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

      <!-- Form Body -->
      <form onsubmit={handleSubmit} class="p-5 sm:p-6 space-y-4 max-h-[80vh] overflow-y-auto">
        <div>
          <label for="url-input" class="block text-xs font-bold text-heading dark:text-white mb-1.5 flex items-center gap-1.5">
            <Link2 class="w-3.5 h-3.5 text-primary dark:text-indigo-400" /> {t('modal.add.url_label', currentLang)}
          </label>
          <input
            id="url-input"
            type="url"
            required
            placeholder={t('modal.add.url_placeholder', currentLang)}
            bind:value={url}
            class="w-full px-3.5 py-2.5 text-xs bg-surface dark:bg-surface-darkcard rounded-lg border border-border-light dark:border-border-dark focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-heading dark:text-white placeholder-subtle dark:placeholder-zinc-500 font-mono"
          />
        </div>

        <!-- HLS Stream Alert Banner -->
        {#if isHlsDetected}
          <div class="p-3.5 rounded-xl bg-gradient-to-r from-secondary/10 to-primary/10 border border-secondary/30 space-y-2.5">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2">
                <Video class="w-4 h-4 text-secondary" />
                <span class="text-xs font-bold text-heading dark:text-white">{t('modal.add.hls_detected', currentLang)}</span>
              </div>
              {#if isProbingHls}
                <span class="text-[11px] font-mono text-subtle dark:text-zinc-400 animate-pulse">{t('modal.add.hls_probing', currentLang)}</span>
              {:else if hlsVariants.length > 0}
                <span class="text-[11px] font-mono font-bold text-primary dark:text-indigo-300">{hlsVariants.length} Quality Profiles</span>
              {/if}
            </div>

            {#if hlsVariants.length > 0}
              <div class="space-y-1.5 pt-1">
                <span class="text-[11px] text-subtle dark:text-zinc-400 font-medium block">{t('modal.add.hls_sub', currentLang)}</span>
                <div class="grid grid-cols-1 gap-1.5 max-h-32 overflow-y-auto">
                  {#each hlsVariants as v}
                    <button
                      type="button"
                      onclick={() => handleSelectVariant(v.url)}
                      class="px-3 py-2 rounded-lg border text-left text-xs font-mono flex items-center justify-between transition-all {selectedVariantUrl === v.url ? 'bg-primary text-white border-primary shadow-sm' : 'bg-surface dark:bg-surface-darkcard border-border-light dark:border-border-dark text-body dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-800'}"
                    >
                      <div class="truncate">
                        <span class="font-bold">{v.resolution || 'Auto Stream'}</span>
                        {#if v.bandwidth}
                          <span class="opacity-80 text-[11px] ml-1">({Math.round(v.bandwidth / 1000)} kbps)</span>
                        {/if}
                      </div>
                      {#if selectedVariantUrl === v.url}
                        <Check class="w-3.5 h-3.5 ml-2 shrink-0" />
                      {/if}
                    </button>
                  {/each}
                </div>
              </div>
            {:else if !isProbingHls}
              <p class="text-[11px] text-body dark:text-zinc-300">
                {t('modal.add.hls_note', currentLang)}
              </p>
            {/if}
          </div>
        {/if}

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label for="filename-input" class="block text-xs font-bold text-heading dark:text-white mb-1.5">{t('modal.add.filename_label', currentLang)}</label>
            <input
              id="filename-input"
              type="text"
              placeholder={t('modal.add.filename_placeholder', currentLang)}
              bind:value={filename}
              class="w-full px-3.5 py-2 text-xs bg-surface dark:bg-surface-darkcard rounded-lg border border-border-light dark:border-border-dark focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-heading dark:text-white placeholder-subtle dark:placeholder-zinc-500 font-mono"
            />
          </div>

          <div>
            <label for="segments-input" class="block text-xs font-bold text-heading dark:text-white mb-1.5 flex items-center justify-between">
              <span>{t('modal.add.slices_label', currentLang)}</span>
              <span class="font-mono text-primary dark:text-indigo-400 font-extrabold px-2 py-0.5 rounded bg-primary/10 dark:bg-primary/20 text-xs">
                {isHlsDetected ? '1 (HLS)' : `${segments} ${t('modal.add.segments', currentLang)}`}
              </span>
            </label>
            <input
              id="segments-input"
              type="range"
              min="1"
              max="32"
              step="1"
              disabled={isHlsDetected}
              bind:value={segments}
              class="w-full accent-primary mt-1.5 disabled:opacity-40 cursor-pointer"
            />
          </div>
        </div>

        <div>
          <label for="savepath-input" class="block text-xs font-bold text-heading dark:text-white mb-1.5 flex items-center gap-1.5">
            <Folder class="w-3.5 h-3.5 text-primary dark:text-indigo-400" /> {t('modal.add.dest_label', currentLang)}
          </label>
          <input
            id="savepath-input"
            type="text"
            bind:value={savePath}
            class="w-full px-3.5 py-2 text-xs bg-surface dark:bg-surface-darkcard rounded-lg border border-border-light dark:border-border-dark focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-heading dark:text-white font-mono"
          />
        </div>

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
            class="px-5 py-2 text-xs font-bold rounded-lg bg-primary hover:bg-primary-hover text-white shadow-md shadow-primary/20 transition-all flex items-center gap-1.5"
          >
            <Plus class="w-3.5 h-3.5" /> {t('modal.add.submit', currentLang)}
          </button>
        </div>
      </form>
    </div>
  </div>
{/if}
