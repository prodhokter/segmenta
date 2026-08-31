<script lang="ts">
  import { onMount } from 'svelte';
  import type { TaskRecord, SegmentRecord, AppSettings, ScheduledTaskItem, VariantStream } from '$lib/types';
  import Speedometer from '../components/Speedometer.svelte';
  import SegmentInspector from '../components/SegmentInspector.svelte';
  import TaskQueue from '../components/TaskQueue.svelte';
  import AddDownloadModal from '../components/AddDownloadModal.svelte';
  import SettingsModal from '../components/SettingsModal.svelte';
  import SchedulerModal from '../components/SchedulerModal.svelte';
  import {
    Plus,
    Gauge,
    Layers,
    Play,
    Pause,
    RotateCcw,
    Sliders,
    Zap,
    Download,
    CheckCircle2,
    Clock,
    FolderOpen,
    Wifi,
    Settings,
    Calendar,
    Sun,
    Moon,
    Monitor,
    Globe,
    Power,
    Check,
    Copy,
    Trash2,
    ExternalLink,
    ShieldCheck,
    Cpu,
    Server
  } from 'lucide-svelte';

  import { t, getLanguage, setLanguage, SUPPORTED_LANGUAGES, type LanguageCode } from '$lib/i18n';
  import { invoke } from '@tauri-apps/api/core';

  // Tauri invoke helper with safe browser fallback
  async function invokeCommand<T>(cmd: string, args: Record<string, any> = {}): Promise<T> {
    try {
      if (typeof window !== 'undefined' && ((window as any).__TAURI_INTERNALS__ || (window as any).__TAURI__)) {
        return await invoke<T>(cmd, args);
      }
    } catch (e) {
      console.error(`[Tauri Command Failed] ${cmd}:`, e);
      throw e;
    }
    return mockInvoke<T>(cmd, args);
  }

  let currentLang = $state<LanguageCode>(getLanguage());
  let currentTheme = $state<'system' | 'light' | 'dark'>('system');
  let isDarkMode = $state(false);
  let tasks: TaskRecord[] = $state([]);
  let selectedTaskId: string | null = $state(null);
  let selectedSegments: SegmentRecord[] = $state([]);
  let scheduledTasks: ScheduledTaskItem[] = $state([]);
  let isAddModalOpen = $state(false);
  let isSettingsModalOpen = $state(false);
  let isSchedulerModalOpen = $state(false);
  let isLangMenuOpen = $state(false);
  let liveSpeedBytes = $state(0);
  let copiedToast = $state(false);

  let settings: AppSettings = $state({
    download_dir: 'C:\\Downloads',
    max_concurrent_downloads: 3,
    default_segments: 8,
    speed_limit_kb: 0,
    theme: 'system',
    auto_categorize: true,
    autostart: false,
    start_minimized: false,
    minimize_to_tray_on_close: true,
    language: 'en',
  });

  // Mock store for web preview & demo simulation
  let mockTasksStore: TaskRecord[] = [
    {
      id: 'task-demo-1',
      url: 'https://download.sample.org/ubuntu-24.04-desktop-amd64.iso',
      filename: 'ubuntu-24.04-desktop-amd64.iso',
      save_path: 'C:\\Downloads\\ubuntu-24.04-desktop-amd64.iso',
      temp_path: 'C:\\Temp\\task-demo-1',
      status: 'Downloading',
      total_size: 4718592000,
      downloaded_size: 3067084800,
      segments_count: 8,
      speed_limit_bytes: null,
      priority: 5,
      category_id: 'iso',
      headers: {},
      etag: '"sample-etag-123"',
      last_modified: '2026-08-30T12:00:00Z',
      checksum_sha256: null,
      error_message: null,
      created_at: new Date(Date.now() - 3600000).toISOString(),
      updated_at: new Date().toISOString(),
      finished_at: null,
    },
    {
      id: 'task-demo-2',
      url: 'https://archive.org/4k-cinematic-trailer.mp4',
      filename: '4k-cinematic-trailer.mp4',
      save_path: 'C:\\Downloads\\4k-cinematic-trailer.mp4',
      temp_path: 'C:\\Temp\\task-demo-2',
      status: 'Completed',
      total_size: 157286400,
      downloaded_size: 157286400,
      segments_count: 4,
      speed_limit_bytes: null,
      priority: 5,
      category_id: 'video',
      headers: {},
      etag: null,
      last_modified: null,
      checksum_sha256: null,
      error_message: null,
      created_at: new Date(Date.now() - 86400000).toISOString(),
      updated_at: new Date(Date.now() - 85000000).toISOString(),
      finished_at: new Date(Date.now() - 85000000).toISOString(),
    },
    {
      id: 'task-demo-3',
      url: 'https://cdn.example.com/audio/master-soundtrack.flac',
      filename: 'master-soundtrack.flac',
      save_path: 'C:\\Downloads\\master-soundtrack.flac',
      temp_path: 'C:\\Temp\\task-demo-3',
      status: 'Paused',
      total_size: 45000000,
      downloaded_size: 18000000,
      segments_count: 6,
      speed_limit_bytes: null,
      priority: 3,
      category_id: 'audio',
      headers: {},
      etag: null,
      last_modified: null,
      checksum_sha256: null,
      error_message: null,
      created_at: new Date(Date.now() - 7200000).toISOString(),
      updated_at: new Date(Date.now() - 3600000).toISOString(),
      finished_at: null,
    }
  ];

  async function mockInvoke<T>(cmd: string, args: Record<string, any>): Promise<T> {
    if (cmd === 'list_tasks') return [...mockTasksStore] as unknown as T;
    if (cmd === 'get_settings') return { ...settings } as unknown as T;
    if (cmd === 'save_settings') {
      settings = { ...args.settings };
      return undefined as unknown as T;
    }
    if (cmd === 'get_autostart') return (settings.autostart ?? false) as unknown as T;
    if (cmd === 'set_autostart') {
      settings.autostart = args.enable;
      return undefined as unknown as T;
    }
    if (cmd === 'list_scheduled') return [...scheduledTasks] as unknown as T;
    if (cmd === 'probe_m3u8_variants') {
      return [
        { bandwidth: 3500000, resolution: '1920x1080 (1080p)', codecs: 'avc1,mp4a', url: args.url },
        { bandwidth: 1800000, resolution: '1280x720 (720p)', codecs: 'avc1,mp4a', url: args.url },
        { bandwidth: 800000, resolution: '854x480 (480p)', codecs: 'avc1,mp4a', url: args.url },
      ] as unknown as T;
    }
    if (cmd === 'add_task' || cmd === 'schedule_task') {
      const id = 'task-' + Math.random().toString(36).substring(2, 9);
      const newTask: TaskRecord = {
        id,
        url: args.url,
        filename: args.filename || 'download.bin',
        save_path: args.save_path || args.savePath || 'C:\\Downloads',
        temp_path: 'C:\\Temp\\' + id,
        status: cmd === 'schedule_task' ? 'Queued' : 'Downloading',
        total_size: 104857600,
        downloaded_size: 0,
        segments_count: args.segments || 8,
        speed_limit_bytes: null,
        priority: 5,
        category_id: null,
        headers: args.headers || {},
        etag: null,
        last_modified: null,
        checksum_sha256: null,
        error_message: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        finished_at: null,
      };
      mockTasksStore.unshift(newTask);
      if (cmd === 'schedule_task') {
        scheduledTasks.push({
          task: newTask,
          rule: {
            start_at: args.start_at || args.startAt || null,
            stop_at: args.stop_at || args.stopAt || null,
            auto_start_on_add: false,
          },
        });
      }
      return id as unknown as T;
    }
    if (cmd === 'pause_task') {
      const t = mockTasksStore.find((x) => x.id === args.taskId || x.id === args.task_id);
      if (t) t.status = 'Paused';
      return undefined as unknown as T;
    }
    if (cmd === 'resume_task') {
      const t = mockTasksStore.find((x) => x.id === args.taskId || x.id === args.task_id);
      if (t) t.status = 'Downloading';
      return undefined as unknown as T;
    }
    if (cmd === 'cancel_task') {
      mockTasksStore = mockTasksStore.filter((x) => x.id !== args.taskId && x.id !== args.task_id);
      scheduledTasks = scheduledTasks.filter((x) => x.task.id !== args.taskId && x.task.id !== args.task_id);
      return undefined as unknown as T;
    }
    if (cmd === 'get_segments') {
      return [] as unknown as T;
    }
    return undefined as unknown as T;
  }

  function applyTheme(themeName: string) {
    if (typeof document === 'undefined') return;
    currentTheme = (themeName as 'system' | 'light' | 'dark') || 'system';

    const systemIsDark =
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-color-scheme: dark)').matches;

    const dark = themeName === 'dark' || (themeName === 'system' && systemIsDark);
    isDarkMode = dark;

    document.documentElement.classList.toggle('dark', dark);

    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('segmenta_theme', themeName);
      }
    } catch {}
  }

  function toggleThemeMode() {
    let nextTheme: 'light' | 'dark' | 'system' = 'dark';
    if (currentTheme === 'dark') nextTheme = 'light';
    else if (currentTheme === 'light') nextTheme = 'system';
    else nextTheme = 'dark';

    settings.theme = nextTheme;
    applyTheme(nextTheme);
    invokeCommand('save_settings', { settings }).catch(() => {});
  }

  function handleSelectLanguage(code: LanguageCode) {
    currentLang = code;
    setLanguage(code);
    settings.language = code;
    isLangMenuOpen = false;
    invokeCommand('save_settings', { settings }).catch(() => {});
  }

  async function loadInitialSettings() {
    let savedTheme: string | null = null;
    try {
      if (typeof localStorage !== 'undefined') {
        savedTheme = localStorage.getItem('segmenta_theme');
      }
    } catch {}

    try {
      const s = await invokeCommand<AppSettings>('get_settings');
      if (s) {
        if (savedTheme) {
          s.theme = savedTheme;
        }
        settings = s;
        if (s.language) {
          currentLang = s.language as LanguageCode;
          setLanguage(currentLang);
        }
        applyTheme(s.theme);
        return;
      }
    } catch (e) {
      console.warn('Load settings error:', e);
    }

    if (savedTheme) {
      settings.theme = savedTheme;
      applyTheme(savedTheme);
    } else {
      applyTheme(settings.theme);
    }
  }

  async function refreshTasks() {
    try {
      const isTauri = typeof window !== 'undefined' && ((window as any).__TAURI_INTERNALS__ || (window as any).__TAURI__);
      if (!isTauri) {
        mockTasksStore.forEach((t) => {
          if (t.status === 'Downloading') {
            const step = Math.floor(2.2 * 1024 * 1024 + Math.random() * 512 * 1024);
            if (t.total_size && t.total_size > 0) {
              t.downloaded_size = Math.min(t.total_size, t.downloaded_size + step);
              if (t.downloaded_size >= t.total_size) {
                t.status = 'Completed';
                t.finished_at = new Date().toISOString();
              }
            } else {
              t.downloaded_size += step;
            }
            t.updated_at = new Date().toISOString();
          }
        });
      }

      const list = await invokeCommand<TaskRecord[]>('list_tasks');
      if (list) {
        tasks = list;
        if (!selectedTaskId && tasks.length > 0) {
          selectedTaskId = tasks[0].id;
        } else if (selectedTaskId && !tasks.some((t) => t.id === selectedTaskId)) {
          selectedTaskId = tasks.length > 0 ? tasks[0].id : null;
        }
      }

      const scheduled = await invokeCommand<ScheduledTaskItem[]>('list_scheduled');
      if (scheduled) {
        scheduledTasks = scheduled;
      }

      const downloadingTasks = tasks.filter((t) => t.status === 'Downloading');
      if (downloadingTasks.length > 0) {
        const baseSpeed = downloadingTasks.length * 12.8 * 1024 * 1024;
        const jitter = (Math.random() * 3 - 1.5) * 1024 * 1024;
        liveSpeedBytes = Math.max(1024 * 1024, Math.floor(baseSpeed + jitter));
      } else {
        liveSpeedBytes = 0;
      }

      if (selectedTaskId) {
        const segs = await invokeCommand<SegmentRecord[]>('get_segments', { taskId: selectedTaskId });
        if (segs && segs.length > 0) {
          selectedSegments = segs;
        } else {
          selectedSegments = [];
        }
      }
    } catch (e) {
      console.error('Refresh error:', e);
    }
  }

  let selectedTask = $derived(tasks.find((t) => t.id === selectedTaskId) || null);
  let activeDownloadingCount = $derived(tasks.filter((t) => t.status === 'Downloading').length);

  let progressPercent = $derived(
    selectedTask && selectedTask.total_size && selectedTask.total_size > 0
      ? Math.min(100, (selectedTask.downloaded_size / selectedTask.total_size) * 100)
      : selectedTask?.status === 'Completed'
        ? 100
        : 0
  );

  async function handleAddTask(data: { url: string; filename: string; savePath: string; segments: number }) {
    const newId = await invokeCommand<string>('add_task', {
      url: data.url,
      filename: data.filename,
      savePath: data.savePath,
      save_path: data.savePath,
      segments: data.segments,
    });
    if (newId) {
      selectedTaskId = newId;
    }
    await refreshTasks();
  }

  async function handleScheduleTask(data: {
    url: string;
    filename: string;
    savePath: string;
    segments: number;
    startAt: string | null;
    stopAt: string | null;
  }) {
    const newId = await invokeCommand<string>('schedule_task', {
      url: data.url,
      filename: data.filename,
      savePath: data.savePath,
      save_path: data.savePath,
      segments: data.segments,
      startAt: data.startAt,
      start_at: data.startAt,
      stopAt: data.stopAt,
      stop_at: data.stopAt,
    });
    if (newId) {
      selectedTaskId = newId;
    }
    await refreshTasks();
  }

  async function handleSaveSettings(newSettings: AppSettings) {
    settings = newSettings;
    if (newSettings.language) {
      currentLang = newSettings.language as LanguageCode;
      setLanguage(currentLang);
    }
    applyTheme(newSettings.theme);
    await invokeCommand('save_settings', { settings: newSettings });
    if (newSettings.autostart !== undefined) {
      await invokeCommand('set_autostart', { enable: newSettings.autostart });
    }
    await refreshTasks();
  }

  async function handleProbeM3u8(m3u8Url: string): Promise<VariantStream[]> {
    return await invokeCommand<VariantStream[]>('probe_m3u8_variants', { url: m3u8Url });
  }

  async function handlePause(taskId: string) {
    await invokeCommand('pause_task', { taskId, task_id: taskId });
    await refreshTasks();
  }

  async function handleResume(taskId: string) {
    await invokeCommand('resume_task', { taskId, task_id: taskId });
    await refreshTasks();
  }

  async function handleCancel(taskId: string) {
    await invokeCommand('cancel_task', { taskId, task_id: taskId });
    if (selectedTaskId === taskId) {
      const remaining = tasks.filter((t) => t.id !== taskId);
      selectedTaskId = remaining.length > 0 ? remaining[0].id : null;
    }
    await refreshTasks();
  }

  async function handlePauseAll() {
    for (const t of tasks.filter((x) => x.status === 'Downloading')) {
      await invokeCommand('pause_task', { taskId: t.id, task_id: t.id });
    }
    await refreshTasks();
  }

  async function handleResumeAll() {
    for (const t of tasks.filter((x) => x.status === 'Paused' || x.status === 'Queued')) {
      await invokeCommand('resume_task', { taskId: t.id, task_id: t.id });
    }
    await refreshTasks();
  }

  async function handleClearCompleted() {
    for (const t of tasks.filter((x) => x.status === 'Completed')) {
      await invokeCommand('cancel_task', { taskId: t.id, task_id: t.id });
    }
    await refreshTasks();
  }

  async function handleSpeedLimitChange(val: number) {
    settings.speed_limit_kb = val;
    const limitBytes = val > 0 ? val * 1024 : null;
    await invokeCommand('set_speed_limit', { limitBytes, limit_bytes: limitBytes });
    await invokeCommand('save_settings', { settings });
  }

  function copySelectedUrl() {
    if (!selectedTask) return;
    try {
      navigator.clipboard.writeText(selectedTask.url);
      copiedToast = true;
      setTimeout(() => (copiedToast = false), 2000);
    } catch {}
  }

  function formatBytes(bytes: number | null): string {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  onMount(() => {
    loadInitialSettings();
    refreshTasks();

    let mql: MediaQueryList | null = null;
    const systemThemeListener = (e: MediaQueryListEvent) => {
      if (settings.theme === 'system') {
        document.documentElement.classList.toggle('dark', e.matches);
        isDarkMode = e.matches;
      }
    };

    if (typeof window !== 'undefined' && window.matchMedia) {
      mql = window.matchMedia('(prefers-color-scheme: dark)');
      mql.addEventListener('change', systemThemeListener);
    }

    const interval = setInterval(refreshTasks, 1000);

    const handleOutsideClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('#lang-dropdown-btn') && !target.closest('#lang-dropdown-menu')) {
        isLangMenuOpen = false;
      }
    };
    window.addEventListener('click', handleOutsideClick);

    return () => {
      clearInterval(interval);
      if (mql) {
        mql.removeEventListener('change', systemThemeListener);
      }
      window.removeEventListener('click', handleOutsideClick);
    };
  });
</script>

<div class="flex flex-col h-screen overflow-hidden bg-canvas dark:bg-canvas-dark text-body dark:text-zinc-300 transition-colors duration-200 select-none">
  <!-- Top App Navigation / Header with High-End Branding -->
  <header class="h-16 bg-surface dark:bg-surface-dark border-b border-border-light dark:border-border-dark flex items-center justify-between px-5 sm:px-6 shadow-ambient z-30 shrink-0">
    <!-- Left: Brand identity & Status pills -->
    <div class="flex items-center gap-4">
      <div class="flex items-center gap-3">
        <div class="w-10 h-10 rounded-2xl bg-gradient-to-br from-indigo-500 via-primary to-cyan-500 flex items-center justify-center text-white shadow-glow p-2 ring-1 ring-white/20">
          <svg viewBox="0 0 24 24" class="w-full h-full fill-none stroke-current stroke-[2.5]" stroke-linecap="round" stroke-linejoin="round">
            <path d="M18 6H8a4 4 0 0 0-4 4c0 1.5.8 2.8 2 3.5" />
            <path d="M5 18h11a4 4 0 0 0 4-4c0-1.5-.8-2.8-2-3.5" />
            <path d="M12 2v4" />
            <path d="M12 18v4" />
            <path d="M15 15l-3 3-3-3" />
          </svg>
        </div>
        <div>
          <div class="flex items-center gap-2">
            <h1 class="font-extrabold text-base text-heading dark:text-white tracking-tight">
              {t('app.title', currentLang)}
            </h1>
            <span class="text-[10px] px-2 py-0.5 rounded-full font-mono font-extrabold bg-primary/10 dark:bg-primary/20 text-primary dark:text-indigo-300 border border-primary/20">
              {t('app.version_badge', currentLang)}
            </span>
          </div>
          <p class="text-[11px] text-subtle dark:text-zinc-400 hidden sm:block">
            {t('app.tagline', currentLang)}
          </p>
        </div>
      </div>

      <!-- Quick Status Indicators Pill -->
      <div class="hidden md:flex items-center gap-2 pl-3 border-l border-border-light dark:border-border-dark">
        <!-- Online Status Badge -->
        <div class="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-500/20 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
          <span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
          <span>{t('header.status_online', currentLang)}</span>
        </div>

        <!-- Active Downloads Count Badge -->
        <div class="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/10 dark:bg-primary/20 border border-primary/20 text-[11px] font-mono font-bold text-primary dark:text-indigo-300">
          <Download class="w-3 h-3 text-primary" />
          <span>{activeDownloadingCount} {t('header.status_active', currentLang)}</span>
        </div>

        <!-- Autostart Status Pill -->
        <div class="flex items-center gap-1 px-2.5 py-1 rounded-full bg-surface-elevated dark:bg-surface-darkcard border border-border-light dark:border-border-dark text-[11px] font-semibold text-subtle dark:text-zinc-400">
          <Power class="w-3 h-3 {settings.autostart ? 'text-primary' : 'text-zinc-400'}" />
          <span>{settings.autostart ? t('header.autostart_on', currentLang) : t('header.autostart_off', currentLang)}</span>
        </div>
      </div>
    </div>

    <!-- Right: Header Controls, Throttler, Language, Theme, & Action Buttons -->
    <div class="flex items-center gap-2 sm:gap-2.5">
      <!-- Speed Limiter Quick Dropdown -->
      <div class="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-surface-elevated dark:bg-surface-darkelevated border border-border-light dark:border-border-dark text-xs">
        <Wifi class="w-3.5 h-3.5 text-secondary" />
        <span class="text-subtle dark:text-zinc-400 font-semibold hidden lg:inline">{t('nav.throttler', currentLang)}</span>
        <select
          value={settings.speed_limit_kb}
          onchange={(e) => handleSpeedLimitChange(Number((e.target as HTMLSelectElement).value))}
          class="bg-transparent font-mono font-bold text-heading dark:text-white focus:outline-none cursor-pointer text-xs"
        >
          <option value={0} class="bg-surface dark:bg-surface-dark text-heading dark:text-white">{t('nav.unlimited', currentLang)}</option>
          <option value={1024} class="bg-surface dark:bg-surface-dark text-heading dark:text-white">1 MB/s</option>
          <option value={5120} class="bg-surface dark:bg-surface-dark text-heading dark:text-white">5 MB/s</option>
          <option value={10240} class="bg-surface dark:bg-surface-dark text-heading dark:text-white">10 MB/s</option>
          <option value={25600} class="bg-surface dark:bg-surface-dark text-heading dark:text-white">25 MB/s</option>
          <option value={51200} class="bg-surface dark:bg-surface-dark text-heading dark:text-white">50 MB/s</option>
        </select>
      </div>

      <!-- Language Selector Popover Menu -->
      <div class="relative">
        <button
          id="lang-dropdown-btn"
          type="button"
          onclick={() => (isLangMenuOpen = !isLangMenuOpen)}
          class="px-2.5 py-1.5 rounded-xl bg-surface-elevated dark:bg-surface-darkelevated hover:bg-slate-100 dark:hover:bg-zinc-800 border border-border-light dark:border-border-dark text-heading dark:text-white text-xs font-semibold shadow-sm transition-all flex items-center gap-1.5"
          title={t('header.select_language', currentLang)}
        >
          <Globe class="w-3.5 h-3.5 text-primary dark:text-indigo-400" />
          <span class="uppercase font-mono font-bold">{currentLang}</span>
        </button>

        {#if isLangMenuOpen}
          <div
            id="lang-dropdown-menu"
            class="absolute right-0 mt-2 w-44 bg-surface dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark shadow-2xl p-1.5 z-50 animate-in fade-in zoom-in-95 duration-150"
          >
            {#each SUPPORTED_LANGUAGES as langOpt}
              <button
                type="button"
                onclick={() => handleSelectLanguage(langOpt.code)}
                class="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all {currentLang === langOpt.code ? 'bg-primary text-white' : 'hover:bg-surface-elevated dark:hover:bg-zinc-800 text-body dark:text-zinc-300'}"
              >
                <div class="flex items-center gap-2">
                  <span>{langOpt.flag}</span>
                  <span>{langOpt.nativeName}</span>
                </div>
                {#if currentLang === langOpt.code}
                  <Check class="w-3.5 h-3.5" />
                {/if}
              </button>
            {/each}
          </div>
        {/if}
      </div>

      <!-- Theme Switcher Button -->
      <button
        type="button"
        onclick={toggleThemeMode}
        class="p-2 rounded-xl bg-surface-elevated dark:bg-surface-darkelevated hover:bg-slate-100 dark:hover:bg-zinc-800 border border-border-light dark:border-border-dark text-subtle dark:text-zinc-400 hover:text-heading dark:hover:text-white transition-all shadow-sm"
        title={`${t('header.theme_toggle', currentLang)}: ${currentTheme}`}
      >
        {#if currentTheme === 'dark'}
          <Moon class="w-4 h-4 text-indigo-400" />
        {:else if currentTheme === 'light'}
          <Sun class="w-4 h-4 text-amber-500" />
        {:else}
          <Monitor class="w-4 h-4 text-cyan-400" />
        {/if}
      </button>

      <!-- Schedule Modal Button -->
      <button
        type="button"
        onclick={() => (isSchedulerModalOpen = true)}
        class="px-3 py-1.5 rounded-xl bg-surface-elevated dark:bg-surface-darkelevated hover:bg-slate-100 dark:hover:bg-zinc-800 border border-border-light dark:border-border-dark text-heading dark:text-white text-xs font-bold shadow-sm transition-all flex items-center gap-1.5"
        title={t('nav.schedule', currentLang)}
      >
        <Calendar class="w-3.5 h-3.5 text-secondary" />
        <span class="hidden sm:inline">{t('nav.schedule', currentLang)}</span>
        {#if scheduledTasks.length > 0}
          <span class="px-1.5 py-0.2 bg-secondary/15 dark:bg-secondary/25 text-secondary text-[10px] rounded-full font-mono font-bold">
            {scheduledTasks.length}
          </span>
        {/if}
      </button>

      <!-- Settings Modal Button -->
      <button
        type="button"
        onclick={() => (isSettingsModalOpen = true)}
        class="p-2 rounded-xl bg-surface-elevated dark:bg-surface-darkelevated hover:bg-slate-100 dark:hover:bg-zinc-800 border border-border-light dark:border-border-dark text-subtle dark:text-zinc-400 hover:text-heading dark:hover:text-white transition-all shadow-sm"
        title={t('nav.settings', currentLang)}
      >
        <Settings class="w-4 h-4" />
      </button>

      <!-- New Download Primary Action Button -->
      <button
        type="button"
        onclick={() => (isAddModalOpen = true)}
        class="px-3.5 py-1.5 rounded-xl bg-primary hover:bg-primary-hover text-white text-xs font-bold shadow-md shadow-primary/20 transition-all flex items-center gap-1.5 hover:scale-[1.02] active:scale-[0.98]"
      >
        <Plus class="w-4 h-4 stroke-[2.5]" />
        <span class="hidden sm:inline">{t('nav.new_download', currentLang)}</span>
      </button>
    </div>
  </header>

  <!-- Main Bento Grid Workspace Layout -->
  <main class="flex-1 p-4 sm:p-5 grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-5 overflow-hidden">
    <!-- Left Column: Task Queue with modern category chips, search bar, & bulk actions (7 cols) -->
    <section class="lg:col-span-7 flex flex-col h-full overflow-hidden min-h-0">
      <TaskQueue
        {tasks}
        {selectedTaskId}
        {currentLang}
        onSelectTask={(id) => (selectedTaskId = id)}
        onPause={handlePause}
        onResume={handleResume}
        onCancel={handleCancel}
        onPauseAll={handlePauseAll}
        onResumeAll={handleResumeAll}
        onClearCompleted={handleClearCompleted}
      />
    </section>

    <!-- Right Column: Live Speedometer, Segment Inspector, & Task Details Card (5 cols) -->
    <section class="lg:col-span-5 flex flex-col gap-4 overflow-y-auto pr-1 min-h-0">
      <!-- 1. Live Speedometer with Smooth Bezier Gradient Chart -->
      <Speedometer currentSpeedBytes={liveSpeedBytes} {currentLang} />

      <!-- 2. Active Task Details & Segment Inspector Card -->
      {#if selectedTask}
        <div class="bg-surface dark:bg-surface-dark rounded-2xl border border-border-light dark:border-border-dark p-4 sm:p-5 shadow-ambient flex flex-col gap-3">
          <!-- Top Header Info -->
          <div class="flex items-center justify-between">
            <span class="text-xs font-bold uppercase tracking-wider text-subtle dark:text-zinc-400">
              {t('inspect.title', currentLang)}
            </span>
            <div class="flex items-center gap-2">
              <span class="text-xs font-mono font-bold px-2 py-0.5 rounded bg-primary/10 dark:bg-primary/20 text-primary dark:text-indigo-400 border border-primary/20">
                {selectedTask.status}
              </span>
            </div>
          </div>

          <!-- File Info Card -->
          <div class="p-3.5 rounded-xl bg-surface-elevated dark:bg-surface-darkcard border border-border-light dark:border-border-dark space-y-2">
            <div>
              <div class="text-[11px] font-bold text-subtle dark:text-zinc-400 uppercase tracking-wide">{t('inspect.filename', currentLang)}</div>
              <h3 class="text-sm font-extrabold text-heading dark:text-white truncate font-sans" title={selectedTask.filename}>
                {selectedTask.filename}
              </h3>
            </div>

            <div>
              <div class="text-[11px] font-bold text-subtle dark:text-zinc-400 uppercase tracking-wide">{t('inspect.url', currentLang)}</div>
              <div class="flex items-center gap-1.5">
                <span class="text-xs text-subtle dark:text-zinc-400 font-mono truncate flex-1" title={selectedTask.url}>
                  {selectedTask.url}
                </span>
                <button
                  type="button"
                  onclick={copySelectedUrl}
                  class="p-1 rounded hover:bg-slate-200 dark:hover:bg-zinc-800 text-subtle dark:text-zinc-400 hover:text-heading dark:hover:text-white transition-colors"
                  title={t('inspect.copy_url', currentLang)}
                >
                  {#if copiedToast}
                    <Check class="w-3.5 h-3.5 text-emerald-500" />
                  {:else}
                    <Copy class="w-3.5 h-3.5" />
                  {/if}
                </button>
              </div>
            </div>

            <div class="grid grid-cols-2 gap-2 pt-1 text-xs font-mono">
              <div class="p-2 rounded-lg bg-surface dark:bg-surface-darkelevated border border-border-light dark:border-border-dark">
                <span class="text-[10px] text-subtle dark:text-zinc-400 block">{t('inspect.file_size', currentLang)}</span>
                <strong class="text-heading dark:text-zinc-200">{formatBytes(selectedTask.total_size)}</strong>
              </div>
              <div class="p-2 rounded-lg bg-surface dark:bg-surface-darkelevated border border-border-light dark:border-border-dark">
                <span class="text-[10px] text-subtle dark:text-zinc-400 block">{t('inspect.downloaded', currentLang)}</span>
                <strong class="text-primary dark:text-indigo-400">{formatBytes(selectedTask.downloaded_size)}</strong>
              </div>
            </div>
          </div>

          <!-- Multi-Connection Segment Inspector -->
          <SegmentInspector
            segments={selectedSegments}
            segmentsCount={selectedTask.segments_count}
            progressPercent={progressPercent}
            {currentLang}
            isDownloading={selectedTask.status === 'Downloading'}
          />

          <!-- Quick Action Buttons -->
          <div class="flex items-center justify-between gap-2 pt-1">
            <div class="flex items-center gap-2">
              {#if selectedTask.status === 'Downloading'}
                <button
                  type="button"
                  onclick={() => handlePause(selectedTask!.id)}
                  class="px-3 py-1.5 rounded-lg bg-surface-elevated dark:bg-surface-darkcard border border-border-light dark:border-border-dark hover:bg-slate-100 dark:hover:bg-zinc-800 text-xs font-bold text-heading dark:text-white flex items-center gap-1.5 transition-all"
                >
                  <Pause class="w-3.5 h-3.5 text-amber-500" /> {t('inspect.pause', currentLang)}
                </button>
              {:else if selectedTask.status === 'Paused' || selectedTask.status === 'Failed' || selectedTask.status === 'Queued'}
                <button
                  type="button"
                  onclick={() => handleResume(selectedTask!.id)}
                  class="px-3 py-1.5 rounded-lg bg-primary hover:bg-primary-hover text-xs font-bold text-white flex items-center gap-1.5 shadow-sm shadow-primary/20 transition-all"
                >
                  <Play class="w-3.5 h-3.5" /> {t('inspect.resume', currentLang)}
                </button>
              {/if}
            </div>

            <button
              type="button"
              onclick={() => handleCancel(selectedTask!.id)}
              class="px-3 py-1.5 rounded-lg bg-surface-elevated dark:bg-surface-darkcard border border-border-light dark:border-border-dark hover:bg-rose-50 dark:hover:bg-rose-950/40 text-xs font-bold text-subtle dark:text-zinc-400 hover:text-rose-600 dark:hover:text-rose-400 flex items-center gap-1.5 transition-all"
            >
              <Trash2 class="w-3.5 h-3.5" /> {t('inspect.cancel', currentLang)}
            </button>
          </div>
        </div>
      {:else}
        <div class="bg-surface dark:bg-surface-dark rounded-2xl border border-border-light dark:border-border-dark p-8 text-center text-subtle dark:text-zinc-400 shadow-ambient flex flex-col items-center justify-center">
          <div class="w-12 h-12 rounded-2xl bg-surface-elevated dark:bg-surface-darkcard border border-border-light dark:border-border-dark flex items-center justify-center mb-3">
            <Layers class="w-6 h-6 text-subtle dark:text-zinc-500" />
          </div>
          <h4 class="text-sm font-bold text-heading dark:text-white">{t('inspect.empty_title', currentLang)}</h4>
          <p class="text-xs text-subtle dark:text-zinc-400 mt-1 max-w-xs">{t('inspect.empty_sub', currentLang)}</p>
        </div>
      {/if}

      <!-- 3. Engine Architecture & Storage Specs Banner -->
      <div class="bg-surface-elevated dark:bg-surface-darkcard rounded-2xl border border-border-light dark:border-border-dark p-4 flex items-center justify-between text-xs">
        <div class="flex items-center gap-2.5">
          <div class="w-7 h-7 rounded-lg bg-primary/10 dark:bg-primary/20 flex items-center justify-center text-primary dark:text-indigo-400">
            <Cpu class="w-4 h-4" />
          </div>
          <div>
            <div class="font-bold text-heading dark:text-white">{t('inspect.engine_info', currentLang)}</div>
            <div class="text-[11px] text-subtle dark:text-zinc-400 flex items-center gap-1">
              <ShieldCheck class="w-3 h-3 text-secondary" />
              <span>TLS / HTTP Range & Multi-Connection Slicing</span>
            </div>
          </div>
        </div>
        <div class="text-right font-mono text-[11px] text-subtle dark:text-zinc-400">
          <span class="px-2 py-0.5 rounded bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 font-bold">WAL SQLite</span>
        </div>
      </div>
    </section>
  </main>

  <!-- Add Download Modal Dialog -->
  <AddDownloadModal
    isOpen={isAddModalOpen}
    defaultDownloadDir={settings.download_dir}
    defaultSegments={settings.default_segments}
    {currentLang}
    onClose={() => (isAddModalOpen = false)}
    onSubmit={handleAddTask}
    onProbeM3u8={handleProbeM3u8}
  />

  <!-- Preferences / Settings Modal -->
  <SettingsModal
    isOpen={isSettingsModalOpen}
    {settings}
    onClose={() => (isSettingsModalOpen = false)}
    onSave={handleSaveSettings}
  />

  <!-- Scheduler Modal -->
  <SchedulerModal
    isOpen={isSchedulerModalOpen}
    {scheduledTasks}
    defaultDownloadDir={settings.download_dir}
    {currentLang}
    onClose={() => (isSchedulerModalOpen = false)}
    onSchedule={handleScheduleTask}
  />
</div>
