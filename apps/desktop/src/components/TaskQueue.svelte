<script lang="ts">
  import type { TaskRecord } from '$lib/types';
  import { t, type LanguageCode } from '$lib/i18n';
  import {
    Play,
    Pause,
    X,
    Folder,
    CheckCircle2,
    Clock,
    AlertCircle,
    DownloadCloud,
    FileText,
    Video,
    Music,
    Archive,
    Layers,
    Search,
    SlidersHorizontal,
    Trash2,
    CheckSquare,
    Square
  } from 'lucide-svelte';

  interface Props {
    tasks: TaskRecord[];
    selectedTaskId: string | null;
    currentLang?: LanguageCode;
    onSelectTask: (taskId: string) => void;
    onPause: (taskId: string) => void;
    onResume: (taskId: string) => void;
    onCancel: (taskId: string) => void;
    onPauseAll?: () => void;
    onResumeAll?: () => void;
    onClearCompleted?: () => void;
  }

  let {
    tasks,
    selectedTaskId,
    currentLang = 'en',
    onSelectTask,
    onPause,
    onResume,
    onCancel,
    onPauseAll,
    onResumeAll,
    onClearCompleted,
  }: Props = $props();

  let activeCategory = $state<'all' | 'video' | 'audio' | 'archives' | 'documents'>('all');
  let searchQuery = $state('');

  function formatBytes(bytes: number | null): string {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  function getFileCategory(filename: string): 'video' | 'audio' | 'archives' | 'documents' | 'other' {
    const ext = filename.split('.').pop()?.toLowerCase() || '';
    if (['mp4', 'mkv', 'webm', 'avi', 'mov', 'ts', 'm3u8', 'flv'].includes(ext)) return 'video';
    if (['mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a', 'wma'].includes(ext)) return 'audio';
    if (['zip', 'rar', '7z', 'tar', 'gz', 'iso', 'dmg', 'pkg'].includes(ext)) return 'archives';
    if (['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'csv'].includes(ext)) return 'documents';
    return 'other';
  }

  let categoryCounts = $derived({
    all: tasks.length,
    video: tasks.filter((t) => getFileCategory(t.filename) === 'video').length,
    audio: tasks.filter((t) => getFileCategory(t.filename) === 'audio').length,
    archives: tasks.filter((t) => getFileCategory(t.filename) === 'archives').length,
    documents: tasks.filter((t) => getFileCategory(t.filename) === 'documents').length,
  });

  let filteredTasks = $derived(
    tasks.filter((t) => {
      const matchCat =
        activeCategory === 'all' || getFileCategory(t.filename) === activeCategory;
      const matchQuery =
        searchQuery === '' ||
        t.filename.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.url.toLowerCase().includes(searchQuery.toLowerCase());
      return matchCat && matchQuery;
    })
  );

  function getStatusBadge(status: string) {
    switch (status) {
      case 'Downloading':
        return {
          label: t('status.downloading', currentLang),
          bg: 'bg-primary/15 text-primary dark:text-indigo-300 border-primary/20',
          dot: 'bg-primary animate-pulse',
        };
      case 'Completed':
        return {
          label: t('status.completed', currentLang),
          bg: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
          dot: 'bg-emerald-500',
        };
      case 'Paused':
        return {
          label: t('status.paused', currentLang),
          bg: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/20',
          dot: 'bg-amber-500',
        };
      case 'Failed':
        return {
          label: t('status.failed', currentLang),
          bg: 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/20',
          dot: 'bg-rose-500',
        };
      default:
        return {
          label: t('status.queued', currentLang),
          bg: 'bg-zinc-500/15 text-zinc-600 dark:text-zinc-400 border-zinc-500/20',
          dot: 'bg-zinc-400',
        };
    }
  }

  function getCategoryIcon(filename: string) {
    const cat = getFileCategory(filename);
    switch (cat) {
      case 'video':
        return Video;
      case 'audio':
        return Music;
      case 'archives':
        return Archive;
      case 'documents':
        return FileText;
      default:
        return DownloadCloud;
    }
  }
</script>

<div class="flex flex-col h-full bg-surface dark:bg-surface-dark rounded-2xl border border-border-light dark:border-border-dark shadow-ambient overflow-hidden">
  <!-- Toolbar: Category chips & search -->
  <div class="p-3.5 border-b border-border-light dark:border-border-dark flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-surface-elevated dark:bg-surface-darkelevated">
    <!-- Category Chips -->
    <div class="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 text-xs font-semibold scrollbar-none">
      <button
        type="button"
        onclick={() => (activeCategory = 'all')}
        class="px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 shrink-0 {activeCategory === 'all' ? 'bg-primary text-white shadow-sm ring-2 ring-primary/30' : 'bg-surface dark:bg-surface-darkcard hover:bg-slate-100 dark:hover:bg-zinc-800 text-body dark:text-zinc-300 border border-border-light dark:border-border-dark'}"
      >
        <span>{t('cat.all', currentLang)}</span>
        <span class="px-1.5 py-0.2 rounded-full text-[10px] {activeCategory === 'all' ? 'bg-white/20 text-white font-bold' : 'bg-zinc-200 dark:bg-zinc-800 text-subtle dark:text-zinc-400'}">
          {categoryCounts.all}
        </span>
      </button>

      <button
        type="button"
        onclick={() => (activeCategory = 'video')}
        class="px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all shrink-0 {activeCategory === 'video' ? 'bg-primary text-white shadow-sm ring-2 ring-primary/30' : 'bg-surface dark:bg-surface-darkcard hover:bg-slate-100 dark:hover:bg-zinc-800 text-body dark:text-zinc-300 border border-border-light dark:border-border-dark'}"
      >
        <Video class="w-3.5 h-3.5 text-cyan-500" />
        <span>{t('cat.video', currentLang)}</span>
        <span class="px-1.5 py-0.2 rounded-full text-[10px] {activeCategory === 'video' ? 'bg-white/20 text-white font-bold' : 'bg-zinc-200 dark:bg-zinc-800 text-subtle dark:text-zinc-400'}">
          {categoryCounts.video}
        </span>
      </button>

      <button
        type="button"
        onclick={() => (activeCategory = 'audio')}
        class="px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all shrink-0 {activeCategory === 'audio' ? 'bg-primary text-white shadow-sm ring-2 ring-primary/30' : 'bg-surface dark:bg-surface-darkcard hover:bg-slate-100 dark:hover:bg-zinc-800 text-body dark:text-zinc-300 border border-border-light dark:border-border-dark'}"
      >
        <Music class="w-3.5 h-3.5 text-emerald-500" />
        <span>{t('cat.audio', currentLang)}</span>
        <span class="px-1.5 py-0.2 rounded-full text-[10px] {activeCategory === 'audio' ? 'bg-white/20 text-white font-bold' : 'bg-zinc-200 dark:bg-zinc-800 text-subtle dark:text-zinc-400'}">
          {categoryCounts.audio}
        </span>
      </button>

      <button
        type="button"
        onclick={() => (activeCategory = 'archives')}
        class="px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all shrink-0 {activeCategory === 'archives' ? 'bg-primary text-white shadow-sm ring-2 ring-primary/30' : 'bg-surface dark:bg-surface-darkcard hover:bg-slate-100 dark:hover:bg-zinc-800 text-body dark:text-zinc-300 border border-border-light dark:border-border-dark'}"
      >
        <Archive class="w-3.5 h-3.5 text-amber-500" />
        <span>{t('cat.archives', currentLang)}</span>
        <span class="px-1.5 py-0.2 rounded-full text-[10px] {activeCategory === 'archives' ? 'bg-white/20 text-white font-bold' : 'bg-zinc-200 dark:bg-zinc-800 text-subtle dark:text-zinc-400'}">
          {categoryCounts.archives}
        </span>
      </button>

      <button
        type="button"
        onclick={() => (activeCategory = 'documents')}
        class="px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all shrink-0 {activeCategory === 'documents' ? 'bg-primary text-white shadow-sm ring-2 ring-primary/30' : 'bg-surface dark:bg-surface-darkcard hover:bg-slate-100 dark:hover:bg-zinc-800 text-body dark:text-zinc-300 border border-border-light dark:border-border-dark'}"
      >
        <FileText class="w-3.5 h-3.5 text-indigo-400" />
        <span>{t('cat.documents', currentLang)}</span>
        <span class="px-1.5 py-0.2 rounded-full text-[10px] {activeCategory === 'documents' ? 'bg-white/20 text-white font-bold' : 'bg-zinc-200 dark:bg-zinc-800 text-subtle dark:text-zinc-400'}">
          {categoryCounts.documents}
        </span>
      </button>
    </div>

    <!-- Search box -->
    <div class="relative min-w-[200px]">
      <Search class="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-subtle dark:text-zinc-500" />
      <input
        type="text"
        placeholder={t('cat.filter_placeholder', currentLang)}
        bind:value={searchQuery}
        class="w-full pl-8 pr-3 py-1.5 text-xs bg-surface dark:bg-surface-darkcard rounded-lg border border-border-light dark:border-border-dark focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-heading dark:text-white placeholder-subtle dark:placeholder-zinc-500"
      />
    </div>
  </div>

  <!-- Bulk Action Bar -->
  <div class="px-4 py-2 bg-surface dark:bg-surface-dark border-b border-border-light dark:border-border-dark flex items-center justify-between text-xs">
    <span class="text-subtle dark:text-zinc-400 font-mono text-[11px]">
      {filteredTasks.length} {t('queue.total_tasks', currentLang)}
    </span>

    <div class="flex items-center gap-2">
      {#if onPauseAll}
        <button
          type="button"
          onclick={onPauseAll}
          class="px-2.5 py-1 rounded bg-surface-elevated dark:bg-surface-darkcard border border-border-light dark:border-border-dark hover:bg-slate-100 dark:hover:bg-zinc-800 text-subtle dark:text-zinc-300 font-semibold text-[11px] flex items-center gap-1 transition-colors"
        >
          <Pause class="w-3 h-3 text-amber-500" /> {t('queue.bulk_pause_all', currentLang)}
        </button>
      {/if}

      {#if onResumeAll}
        <button
          type="button"
          onclick={onResumeAll}
          class="px-2.5 py-1 rounded bg-surface-elevated dark:bg-surface-darkcard border border-border-light dark:border-border-dark hover:bg-slate-100 dark:hover:bg-zinc-800 text-subtle dark:text-zinc-300 font-semibold text-[11px] flex items-center gap-1 transition-colors"
        >
          <Play class="w-3 h-3 text-primary" /> {t('queue.bulk_resume_all', currentLang)}
        </button>
      {/if}

      {#if onClearCompleted}
        <button
          type="button"
          onclick={onClearCompleted}
          class="px-2.5 py-1 rounded bg-surface-elevated dark:bg-surface-darkcard border border-border-light dark:border-border-dark hover:bg-rose-50 dark:hover:bg-rose-950/30 hover:text-rose-600 dark:hover:text-rose-400 text-subtle dark:text-zinc-300 font-semibold text-[11px] flex items-center gap-1 transition-colors"
        >
          <Trash2 class="w-3 h-3" /> {t('queue.bulk_clear_completed', currentLang)}
        </button>
      {/if}
    </div>
  </div>

  <!-- Task Table / List -->
  <div class="flex-1 overflow-y-auto">
    {#if filteredTasks.length === 0}
      <div class="h-64 flex flex-col items-center justify-center text-center p-6 text-subtle dark:text-zinc-400">
        <div class="w-12 h-12 rounded-2xl bg-surface-elevated dark:bg-surface-darkcard border border-border-light dark:border-border-dark flex items-center justify-center mb-3">
          <DownloadCloud class="w-6 h-6 text-subtle dark:text-zinc-500" />
        </div>
        <p class="text-sm font-bold text-heading dark:text-white">{t('cat.empty_title', currentLang)}</p>
        <p class="text-xs text-subtle dark:text-zinc-400 mt-1 max-w-sm">{t('cat.empty_sub', currentLang)}</p>
      </div>
    {:else}
      <div class="divide-y divide-border-light dark:divide-border-dark">
        {#each filteredTasks as task (task.id)}
          {@const badge = getStatusBadge(task.status)}
          {@const pct = task.total_size && task.total_size > 0 ? Math.min(100, Math.round((task.downloaded_size / task.total_size) * 100)) : (task.status === 'Completed' ? 100 : 0)}
          {@const CatIcon = getCategoryIcon(task.filename)}
          {@const isSelected = selectedTaskId === task.id}

          <!-- Task item row -->
          <div
            tabindex="0"
            role="button"
            onclick={() => onSelectTask(task.id)}
            onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') onSelectTask(task.id); }}
            class="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-surface-elevated dark:hover:bg-zinc-800/50 transition-all cursor-pointer relative group {isSelected ? 'bg-primary/5 dark:bg-indigo-950/30 border-l-4 border-primary shadow-sm' : ''}"
          >
            <div class="flex items-start gap-3 flex-1 min-w-0 pr-2">
              <div class="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5 {isSelected ? 'bg-primary text-white shadow-sm' : 'bg-surface-elevated dark:bg-surface-darkelevated text-subtle dark:text-zinc-400 border border-border-light dark:border-border-dark'}">
                <CatIcon class="w-4 h-4" />
              </div>

              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2 mb-1">
                  <span class="text-[10px] px-2 py-0.5 rounded-full font-mono font-bold border flex items-center gap-1 {badge.bg}">
                    <span class="w-1.5 h-1.5 rounded-full {badge.dot}"></span>
                    {badge.label}
                  </span>
                  <span class="text-xs font-bold text-heading dark:text-white truncate font-sans tracking-tight" title={task.filename}>
                    {task.filename}
                  </span>
                </div>

                <!-- Sleek multi-tone progress bar -->
                <div class="w-full bg-slate-200 dark:bg-zinc-800/80 rounded-full h-2 my-2 overflow-hidden shadow-inner">
                  <div
                    class="h-full rounded-full transition-all duration-300 {task.status === 'Completed' ? 'bg-emerald-500' : 'bg-gradient-to-r from-primary to-secondary'}"
                    style="width: {pct}%"
                  ></div>
                </div>

                <!-- Metadata row -->
                <div class="flex items-center gap-3 text-[11px] text-subtle dark:text-zinc-400 font-mono">
                  <span>{formatBytes(task.downloaded_size)} / {formatBytes(task.total_size)}</span>
                  <span>•</span>
                  <span class="font-bold text-heading dark:text-zinc-300">{pct}%</span>
                  <span>•</span>
                  <span class="flex items-center gap-1 text-primary dark:text-indigo-400 font-semibold">
                    <Layers class="w-3 h-3" /> {task.segments_count} {t('status.parts', currentLang)}
                  </span>
                </div>
              </div>
            </div>

            <!-- Action buttons -->
            <div
              class="flex items-center gap-1.5 self-end sm:self-center shrink-0"
              role="group"
              aria-label="Task actions"
            >
              {#if task.status === 'Downloading'}
                <button
                  type="button"
                  onclick={(e) => { e.stopPropagation(); onPause(task.id); }}
                  title={t('inspect.pause', currentLang)}
                  class="p-2 rounded-lg bg-surface dark:bg-surface-darkcard border border-border-light dark:border-border-dark hover:bg-slate-100 dark:hover:bg-zinc-800 text-heading dark:text-white transition-all shadow-sm"
                >
                  <Pause class="w-3.5 h-3.5 text-amber-500" />
                </button>
              {:else if task.status === 'Paused' || task.status === 'Failed' || task.status === 'Queued'}
                <button
                  type="button"
                  onclick={(e) => { e.stopPropagation(); onResume(task.id); }}
                  title={t('inspect.resume', currentLang)}
                  class="p-2 rounded-lg bg-primary hover:bg-primary-hover text-white transition-all shadow-sm shadow-primary/20"
                >
                  <Play class="w-3.5 h-3.5" />
                </button>
              {/if}

              <button
                type="button"
                onclick={(e) => { e.stopPropagation(); onCancel(task.id); }}
                title={t('inspect.cancel', currentLang)}
                class="p-2 rounded-lg bg-surface dark:bg-surface-darkcard border border-border-light dark:border-border-dark hover:bg-rose-50 dark:hover:bg-rose-950/40 hover:text-rose-600 dark:hover:text-rose-400 text-subtle dark:text-zinc-400 transition-colors shadow-sm"
              >
                <X class="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </div>
</div>
