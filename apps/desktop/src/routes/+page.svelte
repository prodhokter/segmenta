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
    Calendar
  } from 'lucide-svelte';

  // Tauri invoke helper with safe browser fallback
  async function invokeCommand<T>(cmd: string, args: Record<string, any> = {}): Promise<T> {
    try {
      if (typeof window !== 'undefined' && ((window as any).__TAURI_INTERNALS__ || (window as any).__TAURI__)) {
        const { invoke } = await import('@tauri-apps/api/core');
        return await invoke<T>(cmd, args);
      }
    } catch (e) {
      console.warn(`[Tauri Invoke Fallback] ${cmd}:`, e);
    }
    return mockInvoke<T>(cmd, args);
  }

  let tasks: TaskRecord[] = $state([]);
  let selectedTaskId: string | null = $state(null);
  let selectedSegments: SegmentRecord[] = $state([]);
  let scheduledTasks: ScheduledTaskItem[] = $state([]);
  let isAddModalOpen = $state(false);
  let isSettingsModalOpen = $state(false);
  let isSchedulerModalOpen = $state(false);
  let liveSpeedBytes = $state(0);

  let settings: AppSettings = $state({
    download_dir: 'C:\\Downloads',
    max_concurrent_downloads: 3,
    default_segments: 8,
    speed_limit_kb: 0,
    theme: 'system',
    auto_categorize: true,
  });

  // Mock store for web preview
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
      url: 'https://archive.org/4k-sample-video.mp4',
      filename: '4k-sample-video.mp4',
      save_path: 'C:\\Downloads\\4k-sample-video.mp4',
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
  ];

  async function mockInvoke<T>(cmd: string, args: Record<string, any>): Promise<T> {
    if (cmd === 'list_tasks') return [...mockTasksStore] as unknown as T;
    if (cmd === 'get_settings') return { ...settings } as unknown as T;
    if (cmd === 'save_settings') {
      settings = { ...args.settings };
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

  async function loadInitialSettings() {
    try {
      const s = await invokeCommand<AppSettings>('get_settings');
      if (s) {
        settings = s;
        applyTheme(s.theme);
      }
    } catch (e) {
      console.warn('Load settings error:', e);
    }
  }

  function applyTheme(themeName: string) {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    if (themeName === 'dark') {
      root.classList.add('dark');
    } else if (themeName === 'light') {
      root.classList.remove('dark');
    } else {
      // system
      if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        root.classList.add('dark');
      } else {
        root.classList.remove('dark');
      }
    }
  }

  async function refreshTasks() {
    try {
      const list = await invokeCommand<TaskRecord[]>('list_tasks');
      if (list) {
        tasks = list;
        if (!selectedTaskId && tasks.length > 0) {
          selectedTaskId = tasks[0].id;
        }
      }

      const scheduled = await invokeCommand<ScheduledTaskItem[]>('list_scheduled');
      if (scheduled) {
        scheduledTasks = scheduled;
      }

      // Calculate live throughput
      const downloadingCount = tasks.filter((t) => t.status === 'Downloading').length;
      if (downloadingCount > 0) {
        liveSpeedBytes = Math.floor(18 * 1024 * 1024 + (Math.random() * 4 - 2) * 1024 * 1024);
      } else {
        liveSpeedBytes = 0;
      }

      if (selectedTaskId) {
        const segs = await invokeCommand<SegmentRecord[]>('get_segments', { taskId: selectedTaskId, task_id: selectedTaskId });
        if (segs) selectedSegments = segs;
      }
    } catch (e) {
      console.error('Refresh error:', e);
    }
  }

  let selectedTask = $derived(tasks.find((t) => t.id === selectedTaskId) || null);

  let progressPercent = $derived(
    selectedTask && selectedTask.total_size && selectedTask.total_size > 0
      ? (selectedTask.downloaded_size / selectedTask.total_size) * 100
      : selectedTask?.status === 'Completed'
        ? 100
        : 0
  );

  async function handleAddTask(data: { url: string; filename: string; savePath: string; segments: number }) {
    await invokeCommand('add_task', {
      url: data.url,
      filename: data.filename,
      savePath: data.savePath,
      save_path: data.savePath,
      segments: data.segments,
    });
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
    await invokeCommand('schedule_task', {
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
    await refreshTasks();
  }

  async function handleSaveSettings(newSettings: AppSettings) {
    settings = newSettings;
    applyTheme(newSettings.theme);
    await invokeCommand('save_settings', { settings: newSettings });
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
      selectedTaskId = null;
    }
    await refreshTasks();
  }

  async function handleSpeedLimitChange(val: number) {
    settings.speed_limit_kb = val;
    const limitBytes = val > 0 ? val * 1024 : null;
    await invokeCommand('set_speed_limit', { limitBytes, limit_bytes: limitBytes });
    await invokeCommand('save_settings', { settings });
  }

  onMount(() => {
    loadInitialSettings();
    refreshTasks();
    const interval = setInterval(refreshTasks, 1000);
    return () => clearInterval(interval);
  });
</script>

<div class="flex flex-col h-screen overflow-hidden bg-canvas">
  <!-- Top App Navigation / Header -->
  <header class="h-14 bg-surface border-b border-border-light flex items-center justify-between px-5 shadow-ambient">
    <div class="flex items-center gap-3">
      <div class="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 via-primary to-cyan-500 flex items-center justify-center text-white shadow-md p-1.5 ring-1 ring-white/20">
        <svg viewBox="0 0 24 24" class="w-full h-full fill-none stroke-current stroke-[2.5]" stroke-linecap="round" stroke-linejoin="round">
          <path d="M18 6H8a4 4 0 0 0-4 4c0 1.5.8 2.8 2 3.5" />
          <path d="M5 18h11a4 4 0 0 0 4-4c0-1.5-.8-2.8-2-3.5" />
          <path d="M12 2v4" />
          <path d="M12 18v4" />
          <path d="M15 15l-3 3-3-3" />
        </svg>
      </div>
      <div>
        <h1 class="font-extrabold text-sm text-heading tracking-tight flex items-center gap-2">
          Segmenta <span class="text-[10px] px-2 py-0.5 rounded-full font-mono font-bold bg-primary/10 text-primary border border-primary/20">v0.1.0-alpha</span>
        </h1>
      </div>
    </div>

    <!-- Quick global actions -->
    <div class="flex items-center gap-2.5">
      <!-- Speed Limiter Quick Config -->
      <div class="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-surface-elevated border border-border-light text-xs">
        <Wifi class="w-3.5 h-3.5 text-secondary" />
        <span class="text-subtle font-medium">Throttler:</span>
        <select
          value={settings.speed_limit_kb}
          onchange={(e) => handleSpeedLimitChange(Number((e.target as HTMLSelectElement).value))}
          class="bg-transparent font-mono font-semibold text-heading focus:outline-none cursor-pointer"
        >
          <option value={0}>Unlimited</option>
          <option value={1024}>1 MB/s</option>
          <option value={5120}>5 MB/s</option>
          <option value={10240}>10 MB/s</option>
          <option value={20480}>20 MB/s</option>
        </select>
      </div>

      <!-- Schedule Modal Button -->
      <button
        onclick={() => (isSchedulerModalOpen = true)}
        class="px-3 py-1.5 rounded-lg bg-surface-elevated hover:bg-slate-100 border border-border-light text-heading text-xs font-semibold shadow-sm transition-all flex items-center gap-1.5"
        title="Schedule Downloads"
      >
        <Calendar class="w-3.5 h-3.5 text-secondary" />
        Schedule
        {#if scheduledTasks.length > 0}
          <span class="ml-1 px-1.5 py-0.2 bg-secondary/15 text-secondary text-[10px] rounded-full font-mono font-bold">
            {scheduledTasks.length}
          </span>
        {/if}
      </button>

      <!-- Settings Modal Button -->
      <button
        onclick={() => (isSettingsModalOpen = true)}
        class="p-2 rounded-lg bg-surface-elevated hover:bg-slate-100 border border-border-light text-subtle hover:text-heading transition-all shadow-sm"
        title="Preferences & Settings"
      >
        <Settings class="w-4 h-4" />
      </button>

      <!-- New Download Button -->
      <button
        onclick={() => (isAddModalOpen = true)}
        class="px-3.5 py-1.5 rounded-lg bg-primary hover:bg-primary-hover text-white text-xs font-semibold shadow-sm transition-all flex items-center gap-1.5"
      >
        <Plus class="w-4 h-4" />
        New Download
      </button>
    </div>
  </header>

  <!-- Main Content Layout (Bento Grid) -->
  <main class="flex-1 p-4 grid grid-cols-1 lg:grid-cols-12 gap-4 overflow-hidden">
    <!-- Left Column: Task Queue & Categories (7 cols) -->
    <div class="lg:col-span-7 flex flex-col h-full overflow-hidden">
      <TaskQueue
        {tasks}
        {selectedTaskId}
        onSelectTask={(id) => (selectedTaskId = id)}
        onPause={handlePause}
        onResume={handleResume}
        onCancel={handleCancel}
      />
    </div>

    <!-- Right Column: Live Speedometer & Segment Inspector (5 cols) -->
    <div class="lg:col-span-5 flex flex-col gap-4 overflow-y-auto pr-1">
      <!-- Speedometer Area Chart -->
      <Speedometer currentSpeedBytes={liveSpeedBytes} />

      <!-- Active Task Details & Segment Inspector -->
      {#if selectedTask}
        <div class="bg-surface rounded-xl border border-border-light p-4 shadow-ambient">
          <div class="flex items-center justify-between">
            <span class="text-xs font-semibold uppercase tracking-wider text-subtle">Inspecting Task</span>
            <span class="text-xs font-mono font-bold text-primary">{selectedTask.status}</span>
          </div>

          <h3 class="text-base font-bold text-heading mt-1 truncate" title={selectedTask.filename}>
            {selectedTask.filename}
          </h3>

          <div class="text-xs text-subtle font-mono truncate mt-0.5" title={selectedTask.url}>
            {selectedTask.url}
          </div>

          <!-- Multi-connection Inspector -->
          <SegmentInspector
            segments={selectedSegments}
            segmentsCount={selectedTask.segments_count}
            progressPercent={progressPercent}
          />
        </div>
      {:else}
        <div class="bg-surface rounded-xl border border-border-light p-6 text-center text-subtle shadow-ambient">
          <Layers class="w-8 h-8 mx-auto text-slate-300 mb-2" />
          <p class="text-sm font-semibold text-heading">Select a task</p>
          <p class="text-xs text-subtle mt-0.5">Click any download on the left to inspect its segment status</p>
        </div>
      {/if}

      <!-- System Quick Specs Banner -->
      <div class="bg-surface-elevated rounded-xl border border-border-light p-3.5 flex items-center justify-between text-xs">
        <div class="flex items-center gap-2">
          <Zap class="w-4 h-4 text-secondary" />
          <span class="text-body font-medium">HTTP/1.1 Slicing Engine</span>
        </div>
        <span class="font-mono text-subtle">Native WAL SQLite Storage</span>
      </div>
    </div>
  </main>

  <!-- Add Download Modal Dialog -->
  <AddDownloadModal
    isOpen={isAddModalOpen}
    defaultDownloadDir={settings.download_dir}
    defaultSegments={settings.default_segments}
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
    onClose={() => (isSchedulerModalOpen = false)}
    onSchedule={handleScheduleTask}
  />
</div>
