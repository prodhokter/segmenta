<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import type { TaskRecord, SegmentRecord } from '$lib/types';
  import {
    Play,
    Pause,
    X,
    FolderOpen,
    FileText,
    Video,
    Music,
    Archive,
    AppWindow,
    File,
    Minus,
    Cpu,
    Check,
    CheckCircle2,
    AlertCircle,
    Clock,
    Activity,
    Folder,
    ExternalLink,
    Sparkles
  } from 'lucide-svelte';
  import { t, getLanguage, type LanguageCode } from '$lib/i18n';
  import { invoke } from '@tauri-apps/api/core';
  import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';

  let taskId = $state<string>('');
  let task = $state<TaskRecord | null>(null);
  let segments = $state<SegmentRecord[]>([]);
  let transferSpeed = $state<number>(0);
  let previousDownloaded = 0;
  let lastSpeedCheckTime = Date.now();
  let etaSeconds = $state<number | null>(null);
  let currentLang = $state<LanguageCode>(getLanguage());

  // Tauri command invoker with fallback mock for browser testing
  async function invokeCmd<T>(cmd: string, args: Record<string, any> = {}): Promise<T> {
    try {
      if (typeof window !== 'undefined' && ((window as any).__TAURI_INTERNALS__ || (window as any).__TAURI__)) {
        return await invoke<T>(cmd, args);
      }
    } catch (e) {
      console.warn(`[Progress Tauri Cmd Failed] ${cmd}:`, e);
      throw e;
    }
    return mockProgressInvoke<T>(cmd, args);
  }

  // Browser preview mock
  async function mockProgressInvoke<T>(cmd: string, args: Record<string, any>): Promise<T> {
    if (cmd === 'get_task') {
      return {
        id: args.taskId || args.task_id || 'demo-task',
        url: 'https://archive.org/download/sample-high-speed-video.mp4',
        filename: 'sample-high-speed-video.mp4',
        save_path: 'C:\\Downloads\\sample-high-speed-video.mp4',
        temp_path: 'C:\\Temp\\demo-task',
        status: 'Downloading',
        total_size: 786432000,
        downloaded_size: 345000000,
        segments_count: 8,
        speed_limit_bytes: null,
        priority: 5,
        category_id: 'video',
        headers: {},
        etag: null,
        last_modified: null,
        checksum_sha256: null,
        error_message: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        finished_at: null,
      } as unknown as T;
    }
    if (cmd === 'get_segments') {
      return [] as unknown as T;
    }
    return undefined as unknown as T;
  }

  async function fetchTaskData() {
    if (!taskId) return;
    try {
      const data = await invokeCmd<TaskRecord | null>('get_task', { taskId, task_id: taskId });
      if (data) {
        task = data;

        // Calculate live speed and ETA
        const now = Date.now();
        const timeDiff = (now - lastSpeedCheckTime) / 1000;
        if (timeDiff >= 0.8) {
          if (data.status === 'Downloading') {
            const bytesDiff = Math.max(0, data.downloaded_size - previousDownloaded);
            transferSpeed = Math.round(bytesDiff / timeDiff);
            previousDownloaded = data.downloaded_size;
            lastSpeedCheckTime = now;

            if (data.total_size && data.total_size > data.downloaded_size && transferSpeed > 0) {
              const remainingBytes = data.total_size - data.downloaded_size;
              etaSeconds = Math.ceil(remainingBytes / transferSpeed);
            } else {
              etaSeconds = null;
            }
          } else {
            transferSpeed = 0;
            etaSeconds = null;
          }
        }
      }

      const segs = await invokeCmd<SegmentRecord[]>('get_segments', { taskId, task_id: taskId });
      if (segs) {
        segments = segs;
      }
    } catch (e) {
      console.error('Fetch progress task error:', e);
    }
  }

  async function handlePause() {
    if (!taskId) return;
    await invokeCmd('pause_task', { taskId, task_id: taskId });
    if (task) task.status = 'Paused';
    await fetchTaskData();
  }

  async function handleResume() {
    if (!taskId) return;
    await invokeCmd('resume_task', { taskId, task_id: taskId });
    if (task) task.status = 'Downloading';
    await fetchTaskData();
  }

  async function handleCancel() {
    if (!taskId) return;
    await invokeCmd('cancel_task', { taskId, task_id: taskId, cleanupPartial: false });
    await handleClose();
  }

  async function handleOpenFile() {
    if (!task?.save_path) return;
    try {
      await invokeCmd('open_file', { path: task.save_path });
    } catch (e) {
      console.error('Failed to open file:', e);
    }
  }

  async function handleOpenFolder() {
    if (!task?.save_path) return;
    try {
      await invokeCmd('open_file_folder', { path: task.save_path });
    } catch (e) {
      console.error('Failed to open folder:', e);
    }
  }

  async function handleClose() {
    try {
      if (typeof window !== 'undefined' && ((window as any).__TAURI_INTERNALS__ || (window as any).__TAURI__)) {
        const win = getCurrentWebviewWindow();
        await win.close();
      } else {
        window.close();
      }
    } catch {
      window.close();
    }
  }

  async function handleMinimize() {
    try {
      if (typeof window !== 'undefined' && ((window as any).__TAURI_INTERNALS__ || (window as any).__TAURI__)) {
        const win = getCurrentWebviewWindow();
        await win.minimize();
      }
    } catch {}
  }

  function formatBytes(bytes: number | null): string {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  function formatSpeed(bytesPerSec: number): string {
    if (!bytesPerSec || bytesPerSec === 0) return '-';
    if (bytesPerSec < 1024 * 1024) {
      return (bytesPerSec / 1024).toFixed(1) + ' KB/s';
    }
    return (bytesPerSec / (1024 * 1024)).toFixed(2) + ' MB/s';
  }

  function formatEta(seconds: number | null): string {
    if (seconds === null || seconds === undefined || isNaN(seconds) || seconds < 0) return '--:--';
    if (seconds >= 3600) {
      const h = Math.floor(seconds / 3600);
      const m = Math.floor((seconds % 3600) / 60);
      return `${h}h ${m}m`;
    }
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}m ${s < 10 ? '0' : ''}${s}s`;
  }

  function getFileIcon(filename: string) {
    const ext = filename.split('.').pop()?.toLowerCase() || '';
    if (['mp4', 'mkv', 'avi', 'mov', 'webm', 'ts', 'm4v', 'flv'].includes(ext)) return Video;
    if (['mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a', 'opus'].includes(ext)) return Music;
    if (['zip', 'rar', '7z', 'tar', 'gz', 'iso', 'dmg', 'pkg'].includes(ext)) return Archive;
    if (['exe', 'msi', 'appimage', 'deb', 'rpm', 'apk'].includes(ext)) return AppWindow;
    if (['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'csv', 'md'].includes(ext)) return FileText;
    return File;
  }

  let FileIcon = $derived(getFileIcon(task?.filename || ''));

  let progressPct = $derived(
    task && task.total_size && task.total_size > 0
      ? Math.min(100, Math.round((task.downloaded_size / task.total_size) * 1000) / 10)
      : task?.status === 'Completed'
        ? 100
        : 0
  );

  let isCompleted = $derived(task?.status === 'Completed' || progressPct >= 100);

  let statusConfig = $derived.by(() => {
    if (isCompleted) {
      return {
        label: t('status.completed', currentLang),
        badgeClass: 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 border-emerald-500/30',
        dot: 'bg-emerald-500',
        barClass: 'bg-emerald-500',
      };
    }
    switch (task?.status) {
      case 'Downloading':
        return {
          label: t('status.downloading', currentLang),
          badgeClass: 'bg-primary/10 dark:bg-primary/20 text-primary dark:text-indigo-400 border-primary/20',
          dot: 'bg-primary animate-pulse',
          barClass: 'bg-gradient-to-r from-primary via-indigo-500 to-secondary animate-pulse',
        };
      case 'Paused':
      case 'PausedByError':
        return {
          label: t('status.paused', currentLang),
          badgeClass: 'bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 border-amber-500/20',
          dot: 'bg-amber-500',
          barClass: 'bg-amber-500',
        };
      case 'Failed':
        return {
          label: t('status.failed', currentLang),
          badgeClass: 'bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 border-rose-500/20',
          dot: 'bg-rose-500',
          barClass: 'bg-rose-500',
        };
      default:
        return {
          label: task?.status || t('status.queued', currentLang),
          badgeClass: 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border-zinc-300 dark:border-zinc-700',
          dot: 'bg-zinc-400',
          barClass: 'bg-zinc-400',
        };
    }
  });

  onMount(() => {
    // Read task ID from query parameter: /progress?id=<task_id>
    const urlParams = new URLSearchParams(window.location.search);
    const id = urlParams.get('id') || (page.url.searchParams.get('id') ?? '');
    taskId = id;

    // Apply dark theme from stored settings or system preference
    try {
      const savedTheme = localStorage.getItem('segmenta_theme');
      const isDark =
        savedTheme === 'dark' ||
        (!savedTheme && typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
      document.documentElement.classList.toggle('dark', isDark);

      const savedLang = localStorage.getItem('segmenta_language');
      if (savedLang) {
        currentLang = savedLang as LanguageCode;
      }
    } catch {}

    fetchTaskData();
    const interval = setInterval(fetchTaskData, 200);

    return () => clearInterval(interval);
  });
</script>

<div class="h-screen w-screen flex flex-col justify-between bg-surface dark:bg-surface-dark select-none p-4 font-sans text-body dark:text-zinc-200 overflow-hidden border-t-2 border-primary antialiased">
  <!-- Top Brand & Header Section -->
  <div class="flex items-center justify-between pb-2 border-b border-border-light dark:border-border-dark shrink-0">
    <div class="flex items-center gap-2">
      <img src="/logo.svg" alt="Segmenta Logo" class="w-5 h-5 rounded shrink-0 drop-shadow-sm" />
      <span class="font-extrabold text-xs text-heading dark:text-white tracking-tight">
        Segmenta
      </span>
      <span class="text-[10px] text-subtle dark:text-zinc-500 font-mono">
        • Progress Window
      </span>
    </div>

    <div class="flex items-center gap-1.5">
      <span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full font-mono text-[10px] font-bold border {statusConfig.badgeClass}">
        {#if isCompleted}
          <Check class="w-3 h-3 text-emerald-500 stroke-[3]" />
          <span>{t('actions.download_complete', currentLang)}</span>
        {:else}
          <span class="w-1.5 h-1.5 rounded-full {statusConfig.dot}"></span>
          <span>{statusConfig.label}</span>
        {/if}
      </span>
    </div>
  </div>

  <!-- Main Content Body -->
  {#if isCompleted}
    <!-- Celebratory Download Complete View -->
    <div class="my-auto py-2 flex flex-col items-center justify-center text-center space-y-3 shrink-0">
      <!-- Emerald Badge & Checkmark Icon -->
      <div class="relative">
        <div class="w-14 h-14 rounded-2xl bg-emerald-500/10 dark:bg-emerald-500/20 border-2 border-emerald-500/30 flex items-center justify-center text-emerald-500 shadow-lg shadow-emerald-500/10">
          <CheckCircle2 class="w-8 h-8 stroke-[2.5]" />
        </div>
        <div class="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow-md">
          <Sparkles class="w-3 h-3" />
        </div>
      </div>

      <div class="max-w-md w-full px-2">
        <h2 class="text-base font-extrabold text-heading dark:text-white truncate" title={task?.filename || ''}>
          {task?.filename || 'Download Completed'}
        </h2>
        <p class="text-xs font-medium text-emerald-600 dark:text-emerald-400 mt-0.5 flex items-center justify-center gap-1">
          <Check class="w-3.5 h-3.5 stroke-[2.5]" />
          <span>{t('actions.download_complete', currentLang)} • {formatBytes(task?.total_size || task?.downloaded_size || 0)}</span>
        </p>
        <p class="text-[10px] font-mono text-subtle dark:text-zinc-400 truncate mt-1 bg-surface-elevated dark:bg-surface-darkcard px-2 py-1 rounded-md border border-border-light dark:border-border-dark" title={task?.save_path || ''}>
          {task?.save_path || ''}
        </p>
      </div>

      <!-- Solid Progress Bar at 100% -->
      <div class="w-full max-w-sm h-2 bg-emerald-100 dark:bg-emerald-950/60 rounded-full overflow-hidden p-0.5 border border-emerald-500/20 shadow-inner">
        <div class="h-full rounded-full bg-emerald-500 w-full"></div>
      </div>
    </div>
  {:else}
    <!-- Active Downloading / Paused / In-Progress View -->
    <!-- File Detail Row: Category Icon + Truncated Filename + Source URL -->
    <div class="flex items-center gap-3 my-1.5 shrink-0">
      <div class="w-10 h-10 rounded-xl bg-primary/10 dark:bg-primary/20 border border-primary/20 flex items-center justify-center text-primary dark:text-indigo-400 shrink-0 shadow-sm">
        <FileIcon class="w-5 h-5" />
      </div>

      <div class="min-w-0 flex-1">
        <h2 class="text-sm font-extrabold text-heading dark:text-white truncate leading-snug" title={task?.filename || 'Loading task...'}>
          {task?.filename || 'Initializing download...'}
        </h2>
        <p class="text-[10px] font-mono text-subtle dark:text-zinc-400 truncate mt-0.5" title={task?.url || ''}>
          {task?.url || 'Connecting to source stream...'}
        </p>
      </div>
    </div>

    <!-- Progress Bar Section with Glowing Gradient Animation -->
    <div class="my-1 space-y-1 shrink-0">
      <div class="flex items-center justify-between text-xs font-mono">
        <span class="text-subtle dark:text-zinc-400 font-semibold flex items-center gap-1">
          <Cpu class="w-3.5 h-3.5 text-secondary" />
          <span>{task?.segments_count || 8} Connections</span>
        </span>
        <span class="font-extrabold text-heading dark:text-white text-sm">
          {progressPct.toFixed(1)}%
        </span>
      </div>

      <!-- Progress Track & Glowing Bar -->
      <div class="w-full h-3 bg-slate-200 dark:bg-zinc-800 rounded-full overflow-hidden p-0.5 border border-border-light dark:border-border-dark shadow-inner relative">
        <div
          class="h-full rounded-full transition-all duration-300 relative overflow-hidden shadow-sm {statusConfig.barClass}"
          style="width: {progressPct}%"
        >
          <!-- Shimmer highlight line -->
          <div class="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-[shimmer_2s_infinite]"></div>
        </div>
      </div>
    </div>

    <!-- 4-Metric Grid: File Size, Downloaded Size, Transfer Rate, ETA Remaining -->
    <div class="grid grid-cols-4 gap-1 p-2 rounded-xl bg-surface-elevated dark:bg-surface-darkcard border border-border-light dark:border-border-dark font-mono shrink-0 text-center shadow-sm">
      <div class="p-1">
        <span class="text-[9px] text-subtle dark:text-zinc-400 block uppercase font-bold tracking-wider">File Size</span>
        <strong class="text-xs text-heading dark:text-zinc-200 block truncate">{formatBytes(task?.total_size ?? null)}</strong>
      </div>

      <div class="p-1 border-l border-border-light dark:border-border-dark">
        <span class="text-[9px] text-subtle dark:text-zinc-400 block uppercase font-bold tracking-wider">Downloaded</span>
        <strong class="text-xs text-primary dark:text-indigo-400 block truncate">{formatBytes(task?.downloaded_size ?? null)}</strong>
      </div>

      <div class="p-1 border-l border-border-light dark:border-border-dark">
        <span class="text-[9px] text-subtle dark:text-zinc-400 block uppercase font-bold tracking-wider">Speed</span>
        <strong class="text-xs text-secondary font-extrabold block truncate">{formatSpeed(transferSpeed)}</strong>
      </div>

      <div class="p-1 border-l border-border-light dark:border-border-dark">
        <span class="text-[9px] text-subtle dark:text-zinc-400 block uppercase font-bold tracking-wider">Time Left</span>
        <strong class="text-xs text-heading dark:text-zinc-200 block truncate">{formatEta(etaSeconds)}</strong>
      </div>
    </div>
  {/if}

  <!-- Bottom Control Bar -->
  <div class="flex items-center justify-between pt-2.5 border-t border-border-light dark:border-border-dark shrink-0">
    {#if isCompleted}
      <!-- Completed State Primary Actions -->
      <div class="flex items-center gap-2">
        <button
          type="button"
          onclick={handleOpenFile}
          class="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-md shadow-emerald-600/20 transition-all active:scale-95 cursor-pointer"
        >
          <ExternalLink class="w-3.5 h-3.5" />
          <span>{t('actions.open_file', currentLang)}</span>
        </button>

        <button
          type="button"
          onclick={handleOpenFolder}
          class="px-3 py-1.5 rounded-lg bg-surface-elevated dark:bg-surface-darkcard border border-border-light dark:border-border-dark hover:bg-slate-100 dark:hover:bg-zinc-800 text-heading dark:text-white text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all active:scale-95 cursor-pointer"
        >
          <FolderOpen class="w-3.5 h-3.5 text-indigo-400" />
          <span>{t('actions.open_folder', currentLang)}</span>
        </button>
      </div>

      <button
        type="button"
        onclick={handleClose}
        class="px-3.5 py-1.5 rounded-lg bg-surface-elevated dark:bg-surface-darkcard border border-border-light dark:border-border-dark hover:bg-slate-100 dark:hover:bg-zinc-800 text-xs font-bold text-subtle dark:text-zinc-300 hover:text-heading dark:hover:text-white flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer"
      >
        <X class="w-3.5 h-3.5" />
        <span>{t('actions.close', currentLang)}</span>
      </button>
    {:else}
      <!-- Downloading / Paused State Controls -->
      <div class="flex items-center gap-1.5">
        {#if task?.status === 'Downloading'}
          <button
            type="button"
            onclick={handlePause}
            class="px-3 py-1.5 rounded-lg bg-surface-elevated dark:bg-surface-darkelevated border border-border-light dark:border-border-dark hover:bg-slate-100 dark:hover:bg-zinc-800 text-xs font-bold text-heading dark:text-white flex items-center gap-1.5 transition-all shadow-sm active:scale-95"
          >
            <Pause class="w-3.5 h-3.5 text-amber-500" />
            <span>Pause</span>
          </button>
        {:else if task?.status === 'Paused' || task?.status === 'Queued' || task?.status === 'Failed' || task?.status === 'PausedByError'}
          <button
            type="button"
            onclick={handleResume}
            class="px-3 py-1.5 rounded-lg bg-primary hover:bg-primary-hover text-xs font-bold text-white flex items-center gap-1.5 shadow-md shadow-primary/20 transition-all active:scale-95"
          >
            <Play class="w-3.5 h-3.5" />
            <span>Resume</span>
          </button>
        {/if}

        <button
          type="button"
          onclick={handleCancel}
          class="px-2.5 py-1.5 rounded-lg bg-surface-elevated dark:bg-surface-darkelevated border border-border-light dark:border-border-dark hover:bg-rose-50 dark:hover:bg-rose-950/40 text-xs font-bold text-subtle dark:text-zinc-400 hover:text-rose-600 dark:hover:text-rose-400 flex items-center gap-1.5 transition-all active:scale-95"
          title="Cancel download"
        >
          <X class="w-3.5 h-3.5" />
          <span>Stop</span>
        </button>
      </div>

      <div class="flex items-center gap-1.5">
        <button
          type="button"
          onclick={handleClose}
          class="px-3 py-1.5 rounded-lg bg-surface-elevated dark:bg-surface-darkelevated border border-border-light dark:border-border-dark hover:bg-slate-100 dark:hover:bg-zinc-800 text-xs font-bold text-subtle dark:text-zinc-300 hover:text-heading dark:hover:text-white flex items-center gap-1.5 transition-all active:scale-95"
          title="Close window (Download continues in background)"
        >
          <Minus class="w-3.5 h-3.5" />
          <span>Hide</span>
        </button>
      </div>
    {/if}
  </div>
</div>
