<script lang="ts">
  import type { SegmentRecord } from '$lib/types';

  interface Props {
    segments?: SegmentRecord[];
    segmentsCount?: number;
    progressPercent?: number;
  }

  let { segments = [], segmentsCount = 8, progressPercent = 0 }: Props = $props();

  let displaySegments = $derived(
    segments.length > 0
      ? segments.map((s) => {
          const total = s.end_offset ? s.end_offset - s.start_offset + 1 : 0;
          const pct = total > 0 ? Math.min(100, Math.round((s.downloaded_bytes / total) * 100)) : (s.status === 'Completed' ? 100 : 0);
          return {
            index: s.segment_index + 1,
            pct,
            status: s.status,
            downloaded: s.downloaded_bytes,
          };
        })
      : Array.from({ length: segmentsCount }, (_, i) => ({
          index: i + 1,
          pct: Math.min(100, Math.max(0, Math.round(progressPercent + (i % 2 === 0 ? 4 : -6)))),
          status: progressPercent >= 100 ? 'Completed' : 'Downloading',
          downloaded: 0,
        }))
  );
</script>

<div class="space-y-2 mt-3 p-4 bg-surface rounded-xl border border-border-light shadow-ambient">
  <div class="flex items-center justify-between text-xs">
    <div class="flex items-center gap-2">
      <span class="font-semibold text-heading">Multi-Part Segmentation</span>
      <span class="px-2 py-0.5 rounded-full bg-primary-light text-primary font-mono text-[11px] font-semibold">
        {displaySegments.length} Chunks Active
      </span>
    </div>
    <span class="text-subtle font-mono">{progressPercent.toFixed(1)}% Reassembled</span>
  </div>

  <div class="grid grid-cols-4 sm:grid-cols-8 gap-2 pt-1">
    {#each displaySegments as seg}
      <div class="bg-surface-elevated rounded-lg p-2 border border-border-light flex flex-col gap-1.5">
        <div class="flex items-center justify-between text-[10px]">
          <span class="font-mono font-medium text-subtle">#{seg.index}</span>
          <span class="font-mono font-bold {seg.pct === 100 ? 'text-secondary' : 'text-primary'}">
            {seg.pct}%
          </span>
        </div>
        <!-- Segment mini progress bar -->
        <div class="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
          <div
            class="h-full rounded-full transition-all duration-300 {seg.pct === 100 ? 'bg-secondary' : 'bg-primary'}"
            style="width: {seg.pct}%"
          ></div>
        </div>
      </div>
    {/each}
  </div>
</div>
