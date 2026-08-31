<script lang="ts">
  import type { TaskRecord } from '$lib/types';
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
    Layers
  } from 'lucide-svelte';

  interface Props {
    tasks: TaskRecord[];
    selectedTaskId: string | null;
    onSelectTask: (taskId: string) => void;
    onPause: (taskId: string) => void;
    onResume: (taskId: string) => void;
    onCancel: (taskId: string) => void;
  }

  let { tasks, selectedTaskId, onSelectTask, onPause, onResume, onCancel }: Props = $props();

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
    if (['mp4', 'mkv', 'webm', 'avi', 'mov', 'ts', 'm3u8'].includes(ext)) return 'video';
    if (['mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a'].includes(ext)) return 'audio';
    if (['zip', 'rar', '7z', 'tar', 'gz', 'iso'].includes(ext)) return 'archives';
    if (['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'txt'].includes(ext)) return 'documents';
    return 'other';
  }

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
        return { label: 'Downloading', bg: 'bg-primary-light dark:bg-indigo-950/60 text-primary dark:text-indigo-300', icon: DownloadCloud };
      case 'Completed':
        return { label: 'Completed', bg: 'bg-secondary-light dark:bg-cyan-950/60 text-secondary-hover dark:text-cyan-300', icon: CheckCircle2 };
      case 'Paused':
        return { label: 'Paused', bg: 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300', icon: Clock };
      case 'Failed':
        return { label: 'Failed', bg: 'bg-rose-100 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300', icon: AlertCircle };
      default:
        return { label: 'Queued', bg: 'bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300', icon: Clock };
    }
  }
</script>

<div class="flex flex-col h-full bg-surface dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark shadow-ambient overflow-hidden">
  <!-- Toolbar: Category filters & search -->
  <div class="p-3 border-b border-border-light dark:border-border-dark flex flex-wrap items-center justify-between gap-3 bg-surface-elevated dark:bg-surface-darkelevated">
    <div class="flex items-center gap-1.5 overflow-x-auto text-xs font-semibold">
      <button
        onclick={() => (activeCategory = 'all')}
        class="px-3 py-1.5 rounded-lg transition-all {activeCategory === 'all' ? 'bg-primary text-white shadow-sm' : 'bg-surface dark:bg-surface-dark hover:bg-slate-100 dark:hover:bg-zinc-800 text-body dark:text-slate-300 border border-border-light dark:border-border-dark'}"
      >
        All ({tasks.length})
      </button>
      <button
        onclick={() => (activeCategory = 'video')}
        class="px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all {activeCategory === 'video' ? 'bg-primary text-white shadow-sm' : 'bg-surface dark:bg-surface-dark hover:bg-slate-100 dark:hover:bg-zinc-800 text-body dark:text-slate-300 border border-border-light dark:border-border-dark'}"
      >
        <Video class="w-3.5 h-3.5" />
        Videos
      </button>
      <button
        onclick={() => (activeCategory = 'audio')}
        class="px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all {activeCategory === 'audio' ? 'bg-primary text-white shadow-sm' : 'bg-surface dark:bg-surface-dark hover:bg-slate-100 dark:hover:bg-zinc-800 text-body dark:text-slate-300 border border-border-light dark:border-border-dark'}"
      >
        <Music class="w-3.5 h-3.5" />
        Audio
      </button>
      <button
        onclick={() => (activeCategory = 'archives')}
        class="px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all {activeCategory === 'archives' ? 'bg-primary text-white shadow-sm' : 'bg-surface dark:bg-surface-dark hover:bg-slate-100 dark:hover:bg-zinc-800 text-body dark:text-slate-300 border border-border-light dark:border-border-dark'}"
      >
        <Archive class="w-3.5 h-3.5" />
        Archives
      </button>
      <button
        onclick={() => (activeCategory = 'documents')}
        class="px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all {activeCategory === 'documents' ? 'bg-primary text-white shadow-sm' : 'bg-surface dark:bg-surface-dark hover:bg-slate-100 dark:hover:bg-zinc-800 text-body dark:text-slate-300 border border-border-light dark:border-border-dark'}"
      >
        <FileText class="w-3.5 h-3.5" />
        Docs
      </button>
    </div>

    <div class="flex items-center gap-2">
      <input
        type="text"
        placeholder="Filter downloads..."
        bind:value={searchQuery}
        class="px-3 py-1.5 text-xs bg-surface dark:bg-surface-dark rounded-lg border border-border-light dark:border-border-dark focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-heading dark:text-white placeholder-subtle dark:placeholder-zinc-500 w-48"
      />
    </div>
  </div>

  <!-- Task Table / List -->
  <div class="flex-1 overflow-y-auto">
    {#if filteredTasks.length === 0}
      <div class="h-64 flex flex-col items-center justify-center text-center p-6 text-subtle dark:text-slate-400">
        <DownloadCloud class="w-10 h-10 text-slate-300 dark:text-zinc-600 mb-2 stroke-[1.5]" />
        <p class="text-sm font-semibold text-heading dark:text-white">No downloads in this view</p>
        <p class="text-xs text-subtle dark:text-slate-400 mt-0.5">Add a new URL to begin fast segmented downloading</p>
      </div>
    {:else}
      <div class="divide-y divide-border-light dark:divide-border-dark">
        {#each filteredTasks as task (task.id)}
          {@const badge = getStatusBadge(task.status)}
          {@const pct = task.total_size && task.total_size > 0 ? Math.min(100, Math.round((task.downloaded_size / task.total_size) * 100)) : (task.status === 'Completed' ? 100 : 0)}
          <!-- Task item row -->
          <div
            tabindex="0"
            role="button"
            onclick={() => onSelectTask(task.id)}
            onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') onSelectTask(task.id); }}
            class="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-surface-elevated dark:hover:bg-zinc-800/60 transition-colors cursor-pointer {selectedTaskId === task.id ? 'bg-primary-light/30 dark:bg-indigo-950/40 border-l-4 border-primary' : ''}"
          >
            <div class="flex-1 min-w-0 pr-4">
              <div class="flex items-center gap-2 mb-1">
                <span class="text-xs px-2 py-0.5 rounded font-mono font-semibold {badge.bg}">
                  {badge.label}
                </span>
                <span class="text-sm font-semibold text-heading dark:text-white truncate font-sans">{task.filename}</span>
              </div>

              <!-- Progress bar -->
              <div class="w-full bg-slate-200 dark:bg-zinc-800 rounded-full h-2 my-1.5 overflow-hidden">
                <div
                  class="h-full rounded-full transition-all duration-300 {task.status === 'Completed' ? 'bg-secondary' : 'bg-primary'}"
                  style="width: {pct}%"
                ></div>
              </div>

              <!-- Metadata row -->
              <div class="flex items-center gap-4 text-xs text-subtle dark:text-slate-400 font-mono">
                <span>{formatBytes(task.downloaded_size)} / {formatBytes(task.total_size)}</span>
                <span>•</span>
                <span>{pct}%</span>
                <span>•</span>
                <span class="flex items-center gap-1">
                  <Layers class="w-3 h-3 text-primary" /> {task.segments_count} parts
                </span>
              </div>
            </div>

            <!-- Action buttons -->
            <div
              class="flex items-center gap-1.5 self-end sm:self-center"
              role="group"
              aria-label="Task actions"
            >
              {#if task.status === 'Downloading'}
                <button
                  type="button"
                  onclick={(e) => { e.stopPropagation(); onPause(task.id); }}
                  title="Pause download"
                  class="p-2 rounded-lg bg-surface dark:bg-surface-dark border border-border-light dark:border-border-dark hover:bg-slate-100 dark:hover:bg-zinc-800 text-heading dark:text-white transition-colors"
                >
                  <Pause class="w-4 h-4" />
                </button>
              {:else if task.status === 'Paused' || task.status === 'Failed'}
                <button
                  type="button"
                  onclick={(e) => { e.stopPropagation(); onResume(task.id); }}
                  title="Resume download"
                  class="p-2 rounded-lg bg-primary hover:bg-primary-hover text-white transition-colors"
                >
                  <Play class="w-4 h-4" />
                </button>
              {/if}

              <button
                type="button"
                onclick={(e) => { e.stopPropagation(); onCancel(task.id); }}
                title="Cancel & remove"
                class="p-2 rounded-lg bg-surface dark:bg-surface-dark border border-border-light dark:border-border-dark hover:bg-rose-50 dark:hover:bg-rose-950/40 hover:text-rose-600 dark:hover:text-rose-400 text-subtle dark:text-slate-400 transition-colors"
              >
                <X class="w-4 h-4" />
              </button>
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </div>
</div>
