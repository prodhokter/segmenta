<script lang="ts">
  import { X, Plus, Folder, Link2, Settings2, Video, Sparkles, Check } from 'lucide-svelte';
  import type { VariantStream } from '$lib/types';

  interface Props {
    isOpen: boolean;
    defaultDownloadDir: string;
    defaultSegments: number;
    onClose: () => void;
    onSubmit: (data: { url: string; filename: string; savePath: string; segments: number }) => void;
    onProbeM3u8?: (url: string) => Promise<VariantStream[]>;
  }

  let { isOpen, defaultDownloadDir, defaultSegments, onClose, onSubmit, onProbeM3u8 }: Props = $props();

  let url = $state('');
  let filename = $state('');
  let savePath = $state('');
  let segments = $state(8);

  // HLS stream detection state
  let isHlsDetected = $state(false);
  let isProbingHls = $state(false);
  let hlsVariants: VariantStream[] = $state([]);
  let selectedVariantUrl = $state('');

  $effect(() => {
    if (isOpen) {
      if (!savePath) savePath = defaultDownloadDir || 'C:\\Downloads';
      segments = defaultSegments || 8;
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
  <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
    <div class="bg-surface rounded-2xl border border-border-light shadow-2xl max-w-lg w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
      <!-- Modal Header -->
      <div class="p-4 bg-surface-elevated border-b border-border-light flex items-center justify-between">
        <div class="flex items-center gap-2">
          <div class="w-8 h-8 rounded-lg bg-primary-light flex items-center justify-center text-primary">
            <Plus class="w-4 h-4" />
          </div>
          <div>
            <h3 class="font-bold text-sm text-heading">New Download Task</h3>
            <p class="text-xs text-subtle">Configure multi-connection segmentation or media stream</p>
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
        <div>
          <label for="url-input" class="block text-xs font-semibold text-heading mb-1 flex items-center gap-1.5">
            <Link2 class="w-3.5 h-3.5 text-primary" /> Source URL
          </label>
          <input
            id="url-input"
            type="url"
            required
            placeholder="https://example.com/files/archive.zip or .m3u8 stream"
            bind:value={url}
            class="w-full px-3.5 py-2 text-sm bg-surface rounded-lg border border-border-light focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-heading font-mono"
          />
        </div>

        <!-- HLS Stream Alert Banner -->
        {#if isHlsDetected}
          <div class="p-3.5 rounded-xl bg-gradient-to-r from-secondary-light/60 to-primary-light/50 border border-secondary/30 space-y-2.5">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2">
                <Video class="w-4 h-4 text-secondary" />
                <span class="text-xs font-bold text-heading">HLS (M3U8) Stream Detected</span>
              </div>
              {#if isProbingHls}
                <span class="text-[11px] font-mono text-subtle animate-pulse">Probing qualities...</span>
              {:else if hlsVariants.length > 0}
                <span class="text-[11px] font-mono font-bold text-primary">{hlsVariants.length} Quality Profiles</span>
              {/if}
            </div>

            {#if hlsVariants.length > 0}
              <div class="space-y-1.5 pt-1">
                <span class="text-[11px] text-subtle font-medium block">Select Variant / Bitrate:</span>
                <div class="grid grid-cols-1 gap-1.5 max-h-32 overflow-y-auto">
                  {#each hlsVariants as v}
                    <button
                      type="button"
                      onclick={() => handleSelectVariant(v.url)}
                      class="px-2.5 py-1.5 rounded-lg border text-left text-xs font-mono flex items-center justify-between transition-all {selectedVariantUrl === v.url ? 'bg-primary text-white border-primary shadow-sm' : 'bg-surface border-border-light text-body hover:bg-slate-50'}"
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
              <p class="text-[11px] text-body">
                Segmenta will automatically parse sequential TS video fragments into a single combined file.
              </p>
            {/if}
          </div>
        {/if}

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label for="filename-input" class="block text-xs font-semibold text-heading mb-1">Target Filename</label>
            <input
              id="filename-input"
              type="text"
              placeholder="archive.zip (auto-probed if empty)"
              bind:value={filename}
              class="w-full px-3 py-1.5 text-xs bg-surface rounded-lg border border-border-light focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-heading"
            />
          </div>

          <div>
            <label for="segments-input" class="block text-xs font-semibold text-heading mb-1 flex items-center justify-between">
              <span>Parallel Slices</span>
              <span class="font-mono text-primary font-bold">{isHlsDetected ? '1 (HLS)' : `${segments} Segments`}</span>
            </label>
            <input
              id="segments-input"
              type="range"
              min="1"
              max="32"
              step="1"
              disabled={isHlsDetected}
              bind:value={segments}
              class="w-full accent-primary mt-1.5 disabled:opacity-40"
            />
          </div>
        </div>

        <div>
          <label for="savepath-input" class="block text-xs font-semibold text-heading mb-1 flex items-center gap-1.5">
            <Folder class="w-3.5 h-3.5 text-subtle" /> Destination Directory
          </label>
          <input
            id="savepath-input"
            type="text"
            bind:value={savePath}
            class="w-full px-3 py-1.5 text-xs bg-surface rounded-lg border border-border-light focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-heading font-mono"
          />
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
            class="px-4 py-2 text-xs font-semibold rounded-lg bg-primary hover:bg-primary-hover text-white shadow-sm transition-colors flex items-center gap-1.5"
          >
            <Plus class="w-3.5 h-3.5" /> Start Download
          </button>
        </div>
      </form>
    </div>
  </div>
{/if}
