<script lang="ts">
  import { X, Plus, Folder, Link2, Settings2 } from 'lucide-svelte';

  interface Props {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (data: { url: string; filename: string; savePath: string; segments: number }) => void;
  }

  let { isOpen, onClose, onSubmit }: Props = $props();

  let url = $state('');
  let filename = $state('');
  let savePath = $state('C:\\Downloads');
  let segments = $state(8);

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

  function handleSubmit(e: SubmitEvent) {
    e.preventDefault();
    if (!url.trim()) return;
    onSubmit({
      url: url.trim(),
      filename: filename.trim(),
      savePath: savePath.trim(),
      segments: Number(segments) || 8,
    });
    url = '';
    filename = '';
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
            <p class="text-xs text-subtle">Configure multi-connection segmentation</p>
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
      <form onsubmit={handleSubmit} class="p-5 space-y-4">
        <div>
          <label for="url-input" class="block text-xs font-semibold text-heading mb-1 flex items-center gap-1.5">
            <Link2 class="w-3.5 h-3.5 text-primary" /> Source URL
          </label>
          <input
            id="url-input"
            type="url"
            required
            placeholder="https://example.com/files/archive.zip"
            bind:value={url}
            class="w-full px-3.5 py-2 text-sm bg-surface rounded-lg border border-border-light focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-heading font-mono"
          />
        </div>

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
              <span class="font-mono text-primary font-bold">{segments} Segments</span>
            </label>
            <input
              id="segments-input"
              type="range"
              min="1"
              max="32"
              step="1"
              bind:value={segments}
              class="w-full accent-primary mt-1.5"
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
