<script lang="ts">
  import type { SegmentRecord } from '$lib/types';
  import { t, type LanguageCode } from '$lib/i18n';
  import { Layers, Activity, CheckCircle2, ArrowDownToLine, Zap } from 'lucide-svelte';

  interface Props {
    segments?: SegmentRecord[];
    segmentsCount?: number;
    progressPercent?: number;
    currentLang?: LanguageCode;
    isDownloading?: boolean;
  }

  let {
    segments = [],
    segmentsCount = 8,
    progressPercent = 0,
    currentLang = 'en',
    isDownloading = true,
  }: Props = $props();

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
      : Array.from({ length: segmentsCount }, (_, i) => {
          const variance = (i * 7) % 15 - 7;
          const rawPct = progressPercent >= 100 ? 100 : Math.min(100, Math.max(0, Math.round(progressPercent + variance)));
          return {
            index: i + 1,
            pct: rawPct,
            status: rawPct >= 100 ? 'Completed' : (isDownloading ? 'Downloading' : 'Paused'),
            downloaded: 0,
          };
        })
  );
</script>

<div class="space-y-3 p-4 sm:p-5 bg-surface dark:bg-surface-darkcard rounded-2xl border border-border-light dark:border-border-dark shadow-ambient">
  <div class="flex items-center justify-between text-xs">
    <div class="flex items-center gap-2">
      <div class="w-6 h-6 rounded-md bg-secondary/10 dark:bg-secondary/20 flex items-center justify-center text-secondary dark:text-cyan-300">
        <Layers class="w-3.5 h-3.5" />
      </div>
      <span class="font-bold text-heading dark:text-white">{t('speed.multi_part', currentLang)}</span>
      <span class="px-2 py-0.5 rounded-full bg-primary/10 dark:bg-primary/20 text-primary dark:text-indigo-300 font-mono text-[11px] font-bold border border-primary/20">
        {displaySegments.length} {t('speed.chunks_active', currentLang)}
      </span>
    </div>
    <div class="flex items-center gap-1 font-mono text-xs font-semibold text-subtle dark:text-zinc-400">
      <span>{t('speed.reassembled', currentLang)}:</span>
      <span class="text-heading dark:text-white font-bold">{progressPercent.toFixed(1)}%</span>
    </div>
  </div>

  <!-- Animated Connection Blocks Grid -->
  <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
    {#each displaySegments as seg}
      {@const isDone = seg.pct >= 100 || seg.status === 'Completed'}
      {@const isActive = seg.status === 'Downloading' && !isDone}
      <div class="relative overflow-hidden rounded-xl p-2.5 border transition-all duration-200 {isDone ? 'bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-500/30' : isActive ? 'bg-surface-elevated dark:bg-surface-darkelevated border-primary/40 shadow-sm' : 'bg-surface-elevated dark:bg-surface-darkelevated border-border-light dark:border-border-dark opacity-75'}">
        <!-- Live pulse glow indicator for downloading parts -->
        {#if isActive}
          <div class="absolute -right-6 -top-6 w-12 h-12 bg-primary/20 rounded-full blur-md animate-pulse"></div>
        {/if}

        <div class="flex items-center justify-between text-[11px] mb-1.5 relative z-10">
          <div class="flex items-center gap-1.5">
            <span class="font-mono font-bold text-subtle dark:text-zinc-400">#{seg.index}</span>
            {#if isDone}
              <span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
            {:else if isActive}
              <span class="w-1.5 h-1.5 rounded-full bg-primary animate-ping"></span>
            {:else}
              <span class="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
            {/if}
          </div>

          <span class="font-mono font-extrabold {isDone ? 'text-emerald-600 dark:text-emerald-400' : 'text-primary dark:text-indigo-400'}">
            {seg.pct}%
          </span>
        </div>

        <!-- Segment visual progress track -->
        <div class="w-full h-2 bg-slate-200 dark:bg-zinc-800 rounded-full overflow-hidden relative">
          <div
            class="h-full rounded-full transition-all duration-300 {isDone ? 'bg-emerald-500' : 'bg-gradient-to-r from-primary to-secondary'}"
            style="width: {seg.pct}%"
          ></div>
        </div>

        <div class="mt-1 flex items-center justify-between text-[10px] font-mono text-subtle dark:text-zinc-500">
          <span>{isDone ? 'Merged' : isActive ? 'Receiving' : 'Standby'}</span>
          <span>{seg.pct === 100 ? '100%' : `${seg.pct}%`}</span>
        </div>
      </div>
    {/each}
  </div>
</div>
