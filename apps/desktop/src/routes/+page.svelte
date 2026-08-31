<script lang="ts">
  import { onMount } from 'svelte';
  import type { TaskRecord, AppSettings, ScheduledTaskItem, VariantStream } from '$lib/types';
  import AddDownloadModal from '../components/AddDownloadModal.svelte';
  import SettingsModal from '../components/SettingsModal.svelte';
  import SchedulerModal from '../components/SchedulerModal.svelte';
  import {
    Plus,
    Play,
    Pause,
    Calendar,
    Settings as SettingsIcon,
    Moon,
    Sun,
    Monitor,
    Globe,
    Check,
    Search,
    Trash2,
    FolderOpen,
    Copy,
    ExternalLink,
    Video,
    Music,
    Archive,
    FileText,
    AppWindow,
    File,
    Download,
    CheckCircle2,
    Clock,
    AlertCircle,
    SlidersHorizontal,
    Layers,
    Wifi,
    CheckSquare,
    Square,
    ChevronDown,
    ChevronRight,
    Sidebar as SidebarIcon,
    Filter,
    ArrowUpDown,
    MoreHorizontal,
    HardDrive,
    Activity,
    Info,
    RefreshCw
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

  // Core Data
  let tasks: TaskRecord[] = $state([]);
  let scheduledTasks: ScheduledTaskItem[] = $state([]);
  let selectedTaskIds = $state<Set<string>>(new Set());
  let focusedTaskId = $state<string | null>(null);

  // UI state
  let isSidebarCollapsed = $state(false);
  let activeNavFilter = $state<'all' | 'downloading' | 'completed' | 'paused' | 'failed' | 'queued'>('all');
  let activeCategory = $state<'all' | 'video' | 'audio' | 'archives' | 'documents' | 'programs' | 'other'>('all');
  let searchQuery = $state('');
  let sortField = $state<'created_at' | 'filename' | 'total_size' | 'status' | 'downloaded_size'>('created_at');
  let sortDirection = $state<'asc' | 'desc'>('desc');

  // Modals & Popovers
  let isAddModalOpen = $state(false);
  let isSettingsModalOpen = $state(false);
  let isSchedulerModalOpen = $state(false);
  let isLangMenuOpen = $state(false);
  let copiedToast = $state(false);

  // Context Menu State
  let contextMenu = $state<{
    visible: boolean;
    x: number;
    y: number;
    taskId: string | null;
  }>({
    visible: false,
    x: 0,
    y: 0,
    taskId: null
  });

  // Settings
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
      category_id: 'archives',
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
    },
    {
      id: 'task-demo-4',
      url: 'https://releases.llvm.org/18.1.8/LLVM-18.1.8-win64.exe',
      filename: 'LLVM-18.1.8-win64.exe',
      save_path: 'C:\\Downloads\\LLVM-18.1.8-win64.exe',
      temp_path: 'C:\\Temp\\task-demo-4',
      status: 'Queued',
      total_size: 324500000,
      downloaded_size: 0,
      segments_count: 8,
      speed_limit_bytes: null,
      priority: 4,
      category_id: 'programs',
      headers: {},
      etag: null,
      last_modified: null,
      checksum_sha256: null,
      error_message: null,
      created_at: new Date(Date.now() - 1800000).toISOString(),
      updated_at: new Date().toISOString(),
      finished_at: null,
    },
    {
      id: 'task-demo-5',
      url: 'https://standards.iso.org/ittf/PubliclyAvailableStandards/ISO_IEC_14882_2020.pdf',
      filename: 'ISO_IEC_14882_2020.pdf',
      save_path: 'C:\\Downloads\\ISO_IEC_14882_2020.pdf',
      temp_path: 'C:\\Temp\\task-demo-5',
      status: 'Completed',
      total_size: 18450000,
      downloaded_size: 18450000,
      segments_count: 4,
      speed_limit_bytes: null,
      priority: 5,
      category_id: 'documents',
      headers: {},
      etag: null,
      last_modified: null,
      checksum_sha256: null,
      error_message: null,
      created_at: new Date(Date.now() - 172800000).toISOString(),
      updated_at: new Date(Date.now() - 172000000).toISOString(),
      finished_at: new Date(Date.now() - 172000000).toISOString(),
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
    if (cmd === 'cancel_task' || cmd === 'delete_task') {
      mockTasksStore = mockTasksStore.filter((x) => x.id !== args.taskId && x.id !== args.task_id);
      scheduledTasks = scheduledTasks.filter((x) => x.task.id !== args.taskId && x.task.id !== args.task_id);
      return undefined as unknown as T;
    }
    return undefined as unknown as T;
  }

  // File categorization helper
  function getFileCategory(filename: string): 'video' | 'audio' | 'archives' | 'documents' | 'programs' | 'other' {
    const ext = filename.split('.').pop()?.toLowerCase() || '';
    if (['mp4', 'mkv', 'webm', 'avi', 'mov', 'ts', 'm3u8', 'flv', 'wmv'].includes(ext)) return 'video';
    if (['mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a', 'wma', 'opus'].includes(ext)) return 'audio';
    if (['zip', 'rar', '7z', 'tar', 'gz', 'iso', 'dmg', 'pkg', 'bz2', 'xz'].includes(ext)) return 'archives';
    if (['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'csv', 'md', 'epub'].includes(ext)) return 'documents';
    if (['exe', 'msi', 'appimage', 'deb', 'rpm', 'apk', 'dmg'].includes(ext)) return 'programs';
    return 'other';
  }

  function getCategoryIcon(cat: string) {
    switch (cat) {
      case 'video':
        return Video;
      case 'audio':
        return Music;
      case 'archives':
        return Archive;
      case 'documents':
        return FileText;
      case 'programs':
        return AppWindow;
      default:
        return File;
    }
  }

  // Formatting helpers
  function formatBytes(bytes: number | null): string {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  function formatSpeed(bytesPerSec: number): string {
    if (!bytesPerSec || bytesPerSec === 0) return '-';
    if (bytesPerSec < 1024 * 1024) {
      return (bytesPerSec / 1024).toFixed(1) + ' KB/s';
    }
    return (bytesPerSec / (1024 * 1024)).toFixed(2) + ' MB/s';
  }

  function formatEta(task: TaskRecord, speed: number): string {
    if (task.status === 'Completed') return '-';
    if (task.status !== 'Downloading' || speed <= 0 || !task.total_size) return '--:--';
    const remainingBytes = Math.max(0, task.total_size - task.downloaded_size);
    const seconds = Math.ceil(remainingBytes / speed);
    if (seconds >= 3600) {
      const h = Math.floor(seconds / 3600);
      const m = Math.floor((seconds % 3600) / 60);
      return `${h}h ${m}m`;
    }
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}m ${s < 10 ? '0' : ''}${s}s`;
  }

  function formatDate(isoString: string): string {
    try {
      const d = new Date(isoString);
      return d.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return isoString;
    }
  }

  // Theme Management
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

  // Real-time speed tracking map
  let taskSpeedMap = $state<Record<string, number>>({});

  async function refreshTasks() {
    try {
      const isTauri = typeof window !== 'undefined' && ((window as any).__TAURI_INTERNALS__ || (window as any).__TAURI__);
      if (!isTauri) {
        mockTasksStore.forEach((t) => {
          if (t.status === 'Downloading') {
            const step = Math.floor(2.2 * 1024 * 1024 + Math.random() * 512 * 1024);
            taskSpeedMap[t.id] = step;
            if (t.total_size && t.total_size > 0) {
              t.downloaded_size = Math.min(t.total_size, t.downloaded_size + step);
              if (t.downloaded_size >= t.total_size) {
                t.status = 'Completed';
                t.finished_at = new Date().toISOString();
                delete taskSpeedMap[t.id];
              }
            } else {
              t.downloaded_size += step;
            }
            t.updated_at = new Date().toISOString();
          } else {
            delete taskSpeedMap[t.id];
          }
        });
      }

      const list = await invokeCommand<TaskRecord[]>('list_tasks');
      if (list) {
        tasks = list;
      }

      const scheduled = await invokeCommand<ScheduledTaskItem[]>('list_scheduled');
      if (scheduled) {
        scheduledTasks = scheduled;
      }
    } catch (e) {
      console.error('Refresh error:', e);
    }
  }

  // Derived counts & filtered list
  let totalActiveDownloads = $derived(tasks.filter((t) => t.status === 'Downloading').length);

  let totalLiveSpeed = $derived(
    Object.values(taskSpeedMap).reduce((acc, curr) => acc + curr, 0)
  );

  let categoryCounts = $derived({
    all: tasks.length,
    video: tasks.filter((t) => getFileCategory(t.filename) === 'video').length,
    audio: tasks.filter((t) => getFileCategory(t.filename) === 'audio').length,
    archives: tasks.filter((t) => getFileCategory(t.filename) === 'archives').length,
    documents: tasks.filter((t) => getFileCategory(t.filename) === 'documents').length,
    programs: tasks.filter((t) => getFileCategory(t.filename) === 'programs').length,
    other: tasks.filter((t) => getFileCategory(t.filename) === 'other').length,
  });

  let statusCounts = $derived({
    all: tasks.length,
    downloading: tasks.filter((t) => t.status === 'Downloading').length,
    completed: tasks.filter((t) => t.status === 'Completed').length,
    paused: tasks.filter((t) => t.status === 'Paused' || t.status === 'PausedByError').length,
    failed: tasks.filter((t) => t.status === 'Failed').length,
    queued: tasks.filter((t) => t.status === 'Queued').length,
  });

  let filteredTasks = $derived.by(() => {
    let result = tasks.filter((t) => {
      // Category filter
      if (activeCategory !== 'all' && getFileCategory(t.filename) !== activeCategory) {
        return false;
      }
      // Status filter
      if (activeNavFilter !== 'all') {
        if (activeNavFilter === 'downloading' && t.status !== 'Downloading') return false;
        if (activeNavFilter === 'completed' && t.status !== 'Completed') return false;
        if (activeNavFilter === 'paused' && t.status !== 'Paused' && t.status !== 'PausedByError') return false;
        if (activeNavFilter === 'failed' && t.status !== 'Failed') return false;
        if (activeNavFilter === 'queued' && t.status !== 'Queued') return false;
      }
      // Search filter
      if (searchQuery.trim() !== '') {
        const q = searchQuery.toLowerCase();
        const matchName = t.filename.toLowerCase().includes(q);
        const matchUrl = t.url.toLowerCase().includes(q);
        if (!matchName && !matchUrl) return false;
      }
      return true;
    });

    // Sorting
    result.sort((a, b) => {
      let valA: any = a[sortField];
      let valB: any = b[sortField];

      if (sortField === 'created_at') {
        valA = new Date(a.created_at).getTime();
        valB = new Date(b.created_at).getTime();
      } else if (sortField === 'total_size') {
        valA = a.total_size || 0;
        valB = b.total_size || 0;
      } else if (typeof valA === 'string') {
        valA = valA.toLowerCase();
        valB = (valB || '').toLowerCase();
      }

      if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
      if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });

    return result;
  });

  // Task Selection & Actions
  let isAllSelected = $derived(
    filteredTasks.length > 0 && filteredTasks.every((t) => selectedTaskIds.has(t.id))
  );

  function toggleSelectAll() {
    if (isAllSelected) {
      selectedTaskIds = new Set();
    } else {
      selectedTaskIds = new Set(filteredTasks.map((t) => t.id));
    }
  }

  function handleRowClick(e: MouseEvent, taskId: string) {
    if (e.ctrlKey || e.metaKey) {
      const next = new Set(selectedTaskIds);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      selectedTaskIds = next;
    } else if (e.shiftKey && focusedTaskId) {
      const ids = filteredTasks.map((t) => t.id);
      const fromIdx = ids.indexOf(focusedTaskId);
      const toIdx = ids.indexOf(taskId);
      if (fromIdx !== -1 && toIdx !== -1) {
        const start = Math.min(fromIdx, toIdx);
        const end = Math.max(fromIdx, toIdx);
        const range = ids.slice(start, end + 1);
        selectedTaskIds = new Set([...selectedTaskIds, ...range]);
      }
    } else {
      selectedTaskIds = new Set([taskId]);
    }
    focusedTaskId = taskId;
  }

  function handleContextMenu(e: MouseEvent, taskId: string) {
    e.preventDefault();
    if (!selectedTaskIds.has(taskId)) {
      selectedTaskIds = new Set([taskId]);
      focusedTaskId = taskId;
    }
    contextMenu = {
      visible: true,
      x: Math.min(e.clientX, window.innerWidth - 220),
      y: Math.min(e.clientY, window.innerHeight - 240),
      taskId
    };
  }

  function closeContextMenu() {
    contextMenu.visible = false;
  }

  // Keyboard navigation
  function handleKeyDown(e: KeyboardEvent) {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
      return;
    }

    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
      e.preventDefault();
      selectedTaskIds = new Set(filteredTasks.map((t) => t.id));
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      if (selectedTaskIds.size > 0) {
        e.preventDefault();
        handleDeleteSelected();
      }
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const ids = filteredTasks.map((t) => t.id);
      if (ids.length === 0) return;

      let nextIdx = 0;
      if (focusedTaskId) {
        const currIdx = ids.indexOf(focusedTaskId);
        if (e.key === 'ArrowDown') {
          nextIdx = Math.min(ids.length - 1, currIdx + 1);
        } else {
          nextIdx = Math.max(0, currIdx - 1);
        }
      }
      const nextId = ids[nextIdx];
      focusedTaskId = nextId;
      if (e.shiftKey) {
        selectedTaskIds = new Set([...selectedTaskIds, nextId]);
      } else {
        selectedTaskIds = new Set([nextId]);
      }
    }
  }

  // Core Actions
  async function handlePause(taskId: string) {
    await invokeCommand('pause_task', { taskId, task_id: taskId });
    await refreshTasks();
  }

  async function handleResume(taskId: string) {
    await invokeCommand('resume_task', { taskId, task_id: taskId });
    await refreshTasks();
  }

  async function handleDelete(taskId: string) {
    await invokeCommand('cancel_task', { taskId, task_id: taskId, cleanupPartial: false });
    const next = new Set(selectedTaskIds);
    next.delete(taskId);
    selectedTaskIds = next;
    if (focusedTaskId === taskId) focusedTaskId = null;
    await refreshTasks();
  }

  async function handlePauseAll() {
    for (const t of tasks.filter((x) => x.status === 'Downloading')) {
      await invokeCommand('pause_task', { taskId: t.id, task_id: t.id });
    }
    await refreshTasks();
  }

  async function handleResumeAll() {
    for (const t of tasks.filter((x) => x.status === 'Paused' || x.status === 'Queued' || x.status === 'Failed')) {
      await invokeCommand('resume_task', { taskId: t.id, task_id: t.id });
    }
    await refreshTasks();
  }

  async function handleClearCompleted() {
    for (const t of tasks.filter((x) => x.status === 'Completed')) {
      await invokeCommand('delete_task', { taskId: t.id, task_id: t.id, deleteFiles: false });
    }
    selectedTaskIds = new Set();
    await refreshTasks();
  }

  async function handlePauseSelected() {
    for (const id of selectedTaskIds) {
      await invokeCommand('pause_task', { taskId: id, task_id: id });
    }
    await refreshTasks();
  }

  async function handleResumeSelected() {
    for (const id of selectedTaskIds) {
      await invokeCommand('resume_task', { taskId: id, task_id: id });
    }
    await refreshTasks();
  }

  async function handleDeleteSelected() {
    for (const id of selectedTaskIds) {
      await invokeCommand('cancel_task', { taskId: id, task_id: id, cleanupPartial: false });
    }
    selectedTaskIds = new Set();
    await refreshTasks();
  }

  async function handleSpeedLimitChange(val: number) {
    settings.speed_limit_kb = val;
    const limitBytes = val > 0 ? val * 1024 : null;
    await invokeCommand('set_speed_limit', { limitBytes, limit_bytes: limitBytes });
    await invokeCommand('save_settings', { settings });
  }

  function handleSort(field: typeof sortField) {
    if (sortField === field) {
      sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      sortField = field;
      sortDirection = 'desc';
    }
  }

  function copyUrl(url: string) {
    try {
      navigator.clipboard.writeText(url);
      copiedToast = true;
      setTimeout(() => (copiedToast = false), 2000);
    } catch {}
  }

  function openContainingFolder(path: string) {
    console.log('Open containing folder:', path);
    // In Tauri, this can be hooked up to tauri plugin opener or shell
  }

  function openProgressPopout(taskId: string) {
    invokeCommand('open_progress_window', { taskId, task_id: taskId }).catch(() => {});
  }

  // Modal Handlers
  async function handleAddTask(data: { url: string; filename: string; savePath: string; segments: number }) {
    const newId = await invokeCommand<string>('add_task', {
      url: data.url,
      filename: data.filename,
      savePath: data.savePath,
      save_path: data.savePath,
      segments: data.segments,
    });
    if (newId) {
      selectedTaskIds = new Set([newId]);
      focusedTaskId = newId;
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
      selectedTaskIds = new Set([newId]);
      focusedTaskId = newId;
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

  function getStatusBadge(status: string) {
    switch (status) {
      case 'Downloading':
        return {
          label: t('status.downloading', currentLang),
          bg: 'bg-primary/10 dark:bg-primary/20 text-primary dark:text-indigo-400 border-primary/20',
          dot: 'bg-primary animate-pulse',
        };
      case 'Completed':
        return {
          label: t('status.completed', currentLang),
          bg: 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
          dot: 'bg-emerald-500',
        };
      case 'Paused':
      case 'PausedByError':
        return {
          label: t('status.paused', currentLang),
          bg: 'bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 border-amber-500/20',
          dot: 'bg-amber-500',
        };
      case 'Failed':
        return {
          label: t('status.failed', currentLang),
          bg: 'bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 border-rose-500/20',
          dot: 'bg-rose-500',
        };
      default:
        return {
          label: t('status.queued', currentLang),
          bg: 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border-zinc-300 dark:border-zinc-700',
          dot: 'bg-zinc-400',
        };
    }
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

    const handleGlobalClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('#lang-dropdown-btn') && !target.closest('#lang-dropdown-menu')) {
        isLangMenuOpen = false;
      }
      if (!target.closest('#context-menu-container')) {
        closeContextMenu();
      }
    };

    window.addEventListener('click', handleGlobalClick);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      clearInterval(interval);
      if (mql) {
        mql.removeEventListener('change', systemThemeListener);
      }
      window.removeEventListener('click', handleGlobalClick);
      window.removeEventListener('keydown', handleKeyDown);
    };
  });
</script>

<div class="flex flex-col h-screen w-screen overflow-hidden bg-canvas dark:bg-canvas-dark text-body dark:text-zinc-200 select-none font-sans text-xs antialiased">
  <!-- Top Application Header & Toolbar -->
  <header class="h-12 bg-surface dark:bg-surface-dark border-b border-border-light dark:border-border-dark flex items-center justify-between px-3.5 z-30 shrink-0 shadow-sm">
    <!-- Left: Branding & Quick Toggle -->
    <div class="flex items-center gap-3">
      <button
        type="button"
        onclick={() => (isSidebarCollapsed = !isSidebarCollapsed)}
        class="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-zinc-800 text-subtle dark:text-zinc-400 hover:text-heading dark:hover:text-white transition-colors"
        title={t('sidebar.collapse', currentLang)}
      >
        <SidebarIcon class="w-4 h-4" />
      </button>

      <!-- App Brand Title -->
      <div class="flex items-center gap-2.5">
        <div class="w-6 h-6 rounded-lg overflow-hidden flex items-center justify-center shadow-sm shrink-0">
          <svg viewBox="0 0 512 512" fill="none" class="w-full h-full">
            <defs>
              <linearGradient id="hdr_seg_grad_1" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#6366f1" />
                <stop offset="50%" stop-color="#4f46e5" />
                <stop offset="100%" stop-color="#4338ca" />
              </linearGradient>
              <linearGradient id="hdr_seg_grad_2" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#22d3ee" />
                <stop offset="50%" stop-color="#06b6d4" />
                <stop offset="100%" stop-color="#0891b2" />
              </linearGradient>
              <linearGradient id="hdr_seg_grad_3" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#34d399" />
                <stop offset="100%" stop-color="#10b981" />
              </linearGradient>
              <linearGradient id="hdr_bg_ambient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#0f172a" />
                <stop offset="100%" stop-color="#020617" />
              </linearGradient>
              <filter id="hdr_glow" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="16" result="blur" />
                <feComposite in="SourceGraphic" in2="blur" operator="over" />
              </filter>
            </defs>
            <rect x="24" y="24" width="464" height="464" rx="108" fill="url(#hdr_bg_ambient)" stroke="#1e293b" stroke-width="6" />
            <path d="M24 160 H488 M24 256 H488 M24 352 H488 M160 24 V488 M256 24 V488 M352 24 V488" stroke="#334155" stroke-opacity="0.15" stroke-width="2" />
            <path d="M370 120 H190 C145.8 120 110 155.8 110 200 C110 215 114.5 229 122 240 L190 240 C175 230 166 215 166 200 C166 186.7 176.7 176 190 176 H370 C385.5 176 398 163.5 398 148 C398 132.5 385.5 120 370 120 Z" fill="url(#hdr_seg_grad_1)" filter="url(#hdr_glow)" />
            <path d="M120 270 L340 180 C365 170 395 188 395 215 C395 240 375 260 350 270 L170 340 C145 350 115 332 115 305 C115 285 125 272 120 270 Z" fill="url(#hdr_seg_grad_2)" />
            <path d="M142 392 H322 C366.2 392 402 356.2 402 312 C402 297 397.5 283 390 272 L322 272 C337 282 346 297 346 312 C346 325.3 335.3 336 322 336 H142 C126.5 336 114 348.5 114 364 C114 379.5 126.5 392 142 392 Z" fill="url(#hdr_seg_grad_3)" filter="url(#hdr_glow)" />
            <circle cx="410" cy="148" r="14" fill="#818cf8" />
            <circle cx="395" cy="215" r="16" fill="#22d3ee" />
            <circle cx="102" cy="364" r="14" fill="#34d399" />
          </svg>
        </div>
        <span class="font-extrabold text-sm text-heading dark:text-white tracking-tight hidden sm:inline">
          {t('app.title', currentLang)}
        </span>
        <span class="text-[10px] px-1.5 py-0.2 rounded font-mono font-bold bg-primary/10 dark:bg-primary/20 text-primary dark:text-indigo-300 border border-primary/20 hidden md:inline">
          {t('app.version_badge', currentLang)}
        </span>
      </div>

      <!-- Quick Action Toolbar -->
      <div class="flex items-center gap-1 pl-2.5 border-l border-border-light dark:border-border-dark">
        <!-- Add URL Action -->
        <button
          type="button"
          onclick={() => (isAddModalOpen = true)}
          class="px-2.5 py-1.5 rounded-lg bg-primary hover:bg-primary-hover text-white font-semibold flex items-center gap-1.5 shadow-sm shadow-primary/20 transition-all hover:scale-[1.02] active:scale-[0.98]"
        >
          <Plus class="w-3.5 h-3.5 stroke-[2.5]" />
          <span>{t('nav.new_download', currentLang)}</span>
        </button>

        <!-- Pause All -->
        <button
          type="button"
          onclick={handlePauseAll}
          class="px-2 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-zinc-800 text-subtle dark:text-zinc-300 hover:text-heading dark:hover:text-white font-medium flex items-center gap-1 transition-colors"
          title={t('nav.pause_all', currentLang)}
        >
          <Pause class="w-3.5 h-3.5 text-amber-500" />
          <span class="hidden md:inline">{t('nav.pause_all', currentLang)}</span>
        </button>

        <!-- Resume All -->
        <button
          type="button"
          onclick={handleResumeAll}
          class="px-2 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-zinc-800 text-subtle dark:text-zinc-300 hover:text-heading dark:hover:text-white font-medium flex items-center gap-1 transition-colors"
          title={t('nav.resume_all', currentLang)}
        >
          <Play class="w-3.5 h-3.5 text-primary dark:text-indigo-400" />
          <span class="hidden md:inline">{t('nav.resume_all', currentLang)}</span>
        </button>

        <!-- Clear Completed -->
        <button
          type="button"
          onclick={handleClearCompleted}
          class="px-2 py-1.5 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/30 text-subtle dark:text-zinc-400 hover:text-rose-600 dark:hover:text-rose-400 font-medium flex items-center gap-1 transition-colors"
          title={t('nav.clear_completed', currentLang)}
        >
          <Trash2 class="w-3.5 h-3.5" />
          <span class="hidden lg:inline">{t('nav.clear_completed', currentLang)}</span>
        </button>
      </div>
    </div>

    <!-- Center: Universal Search & Filter Input -->
    <div class="relative w-48 sm:w-64 md:w-80 mx-2">
      <Search class="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-subtle dark:text-zinc-500" />
      <input
        type="text"
        placeholder={t('cat.filter_placeholder', currentLang)}
        bind:value={searchQuery}
        class="w-full pl-8 pr-3 py-1 bg-surface-elevated dark:bg-surface-darkcard rounded-lg border border-border-light dark:border-border-dark focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary text-heading dark:text-white placeholder-subtle dark:placeholder-zinc-500 text-xs transition-all"
      />
      {#if searchQuery}
        <button
          type="button"
          onclick={() => (searchQuery = '')}
          class="absolute right-2 top-1/2 -translate-y-1/2 text-subtle dark:text-zinc-400 hover:text-heading dark:hover:text-white"
        >
          ×
        </button>
      {/if}
    </div>

    <!-- Right: Throttler, Theme, Lang, Scheduler, Settings -->
    <div class="flex items-center gap-1.5">
      <!-- Speed Throttler Dropdown -->
      <div class="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-surface-elevated dark:bg-surface-darkelevated border border-border-light dark:border-border-dark">
        <Wifi class="w-3 h-3 text-secondary" />
        <select
          value={settings.speed_limit_kb}
          onchange={(e) => handleSpeedLimitChange(Number((e.target as HTMLSelectElement).value))}
          class="bg-transparent font-mono font-bold text-heading dark:text-white focus:outline-none cursor-pointer text-[11px]"
        >
          <option value={0} class="bg-surface dark:bg-surface-dark text-heading dark:text-white">{t('nav.unlimited', currentLang)}</option>
          <option value={1024} class="bg-surface dark:bg-surface-dark text-heading dark:text-white">1 MB/s</option>
          <option value={5120} class="bg-surface dark:bg-surface-dark text-heading dark:text-white">5 MB/s</option>
          <option value={10240} class="bg-surface dark:bg-surface-dark text-heading dark:text-white">10 MB/s</option>
          <option value={25600} class="bg-surface dark:bg-surface-dark text-heading dark:text-white">25 MB/s</option>
          <option value={51200} class="bg-surface dark:bg-surface-dark text-heading dark:text-white">50 MB/s</option>
        </select>
      </div>

      <!-- Schedule Modal Button -->
      <button
        type="button"
        onclick={() => (isSchedulerModalOpen = true)}
        class="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-zinc-800 text-subtle dark:text-zinc-300 hover:text-heading dark:hover:text-white transition-colors relative"
        title={t('nav.schedule', currentLang)}
      >
        <Calendar class="w-4 h-4 text-secondary" />
        {#if scheduledTasks.length > 0}
          <span class="absolute top-0.5 right-0.5 w-2 h-2 rounded-full bg-secondary"></span>
        {/if}
      </button>

      <!-- Language Selector -->
      <div class="relative">
        <button
          id="lang-dropdown-btn"
          type="button"
          onclick={() => (isLangMenuOpen = !isLangMenuOpen)}
          class="px-2 py-1 rounded-lg hover:bg-slate-100 dark:hover:bg-zinc-800 text-subtle dark:text-zinc-300 hover:text-heading dark:hover:text-white font-mono font-bold uppercase transition-colors flex items-center gap-1 text-[11px]"
          title={t('header.select_language', currentLang)}
        >
          <Globe class="w-3.5 h-3.5 text-primary dark:text-indigo-400" />
          <span>{currentLang}</span>
        </button>

        {#if isLangMenuOpen}
          <div
            id="lang-dropdown-menu"
            class="absolute right-0 mt-1.5 w-44 bg-surface dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark shadow-2xl p-1 z-50 animate-in fade-in zoom-in-95 duration-150"
          >
            {#each SUPPORTED_LANGUAGES as langOpt}
              <button
                type="button"
                onclick={() => handleSelectLanguage(langOpt.code)}
                class="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors {currentLang === langOpt.code ? 'bg-primary text-white font-semibold' : 'hover:bg-surface-elevated dark:hover:bg-zinc-800 text-body dark:text-zinc-300'}"
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
        class="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-zinc-800 text-subtle dark:text-zinc-400 hover:text-heading dark:hover:text-white transition-colors"
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

      <!-- Settings Modal Button -->
      <button
        type="button"
        onclick={() => (isSettingsModalOpen = true)}
        class="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-zinc-800 text-subtle dark:text-zinc-400 hover:text-heading dark:hover:text-white transition-colors"
        title={t('nav.settings', currentLang)}
      >
        <SettingsIcon class="w-4 h-4" />
      </button>
    </div>
  </header>

  <!-- Fluid Main Content Area (Sidebar + Center Table) -->
  <div class="flex-1 flex overflow-hidden min-h-0">
    <!-- Left Collapsible / Compact Sidebar -->
    <aside
      class="border-r border-border-light dark:border-border-dark bg-surface dark:bg-surface-dark flex flex-col justify-between transition-all duration-200 shrink-0 z-20 {isSidebarCollapsed ? 'w-14' : 'w-52 md:w-60'}"
    >
      <!-- Top Navigation Tree -->
      <div class="p-2 space-y-4 overflow-y-auto">
        <!-- Status Filter Group -->
        <div>
          {#if !isSidebarCollapsed}
            <div class="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-subtle dark:text-zinc-500">
              {t('sidebar.navigation', currentLang)}
            </div>
          {/if}
          <div class="space-y-0.5 mt-0.5">
            <!-- All Downloads -->
            <button
              type="button"
              onclick={() => { activeNavFilter = 'all'; activeCategory = 'all'; }}
              class="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors {activeNavFilter === 'all' && activeCategory === 'all' ? 'bg-primary text-white font-bold shadow-sm' : 'hover:bg-surface-elevated dark:hover:bg-zinc-800/60 text-body dark:text-zinc-300'}"
              title={t('sidebar.all_tasks', currentLang)}
            >
              <Download class="w-3.5 h-3.5 shrink-0" />
              {#if !isSidebarCollapsed}
                <span class="truncate flex-1 text-left">{t('sidebar.all_tasks', currentLang)}</span>
                <span class="px-1.5 py-0.2 rounded-full text-[10px] font-mono {activeNavFilter === 'all' && activeCategory === 'all' ? 'bg-white/20 text-white' : 'bg-zinc-100 dark:bg-zinc-800 text-subtle dark:text-zinc-400'}">
                  {statusCounts.all}
                </span>
              {/if}
            </button>

            <!-- Downloading Active -->
            <button
              type="button"
              onclick={() => (activeNavFilter = 'downloading')}
              class="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors {activeNavFilter === 'downloading' ? 'bg-primary text-white font-bold shadow-sm' : 'hover:bg-surface-elevated dark:hover:bg-zinc-800/60 text-body dark:text-zinc-300'}"
              title={t('status.downloading', currentLang)}
            >
              <Activity class="w-3.5 h-3.5 shrink-0 text-primary dark:text-indigo-400" />
              {#if !isSidebarCollapsed}
                <span class="truncate flex-1 text-left">{t('status.downloading', currentLang)}</span>
                <span class="px-1.5 py-0.2 rounded-full text-[10px] font-mono {activeNavFilter === 'downloading' ? 'bg-white/20 text-white' : 'bg-zinc-100 dark:bg-zinc-800 text-subtle dark:text-zinc-400'}">
                  {statusCounts.downloading}
                </span>
              {/if}
            </button>

            <!-- Completed -->
            <button
              type="button"
              onclick={() => (activeNavFilter = 'completed')}
              class="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors {activeNavFilter === 'completed' ? 'bg-primary text-white font-bold shadow-sm' : 'hover:bg-surface-elevated dark:hover:bg-zinc-800/60 text-body dark:text-zinc-300'}"
              title={t('status.completed', currentLang)}
            >
              <CheckCircle2 class="w-3.5 h-3.5 shrink-0 text-emerald-500" />
              {#if !isSidebarCollapsed}
                <span class="truncate flex-1 text-left">{t('status.completed', currentLang)}</span>
                <span class="px-1.5 py-0.2 rounded-full text-[10px] font-mono {activeNavFilter === 'completed' ? 'bg-white/20 text-white' : 'bg-zinc-100 dark:bg-zinc-800 text-subtle dark:text-zinc-400'}">
                  {statusCounts.completed}
                </span>
              {/if}
            </button>

            <!-- Paused -->
            <button
              type="button"
              onclick={() => (activeNavFilter = 'paused')}
              class="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors {activeNavFilter === 'paused' ? 'bg-primary text-white font-bold shadow-sm' : 'hover:bg-surface-elevated dark:hover:bg-zinc-800/60 text-body dark:text-zinc-300'}"
              title={t('status.paused', currentLang)}
            >
              <Pause class="w-3.5 h-3.5 shrink-0 text-amber-500" />
              {#if !isSidebarCollapsed}
                <span class="truncate flex-1 text-left">{t('status.paused', currentLang)}</span>
                <span class="px-1.5 py-0.2 rounded-full text-[10px] font-mono {activeNavFilter === 'paused' ? 'bg-white/20 text-white' : 'bg-zinc-100 dark:bg-zinc-800 text-subtle dark:text-zinc-400'}">
                  {statusCounts.paused}
                </span>
              {/if}
            </button>

            <!-- Queued -->
            <button
              type="button"
              onclick={() => (activeNavFilter = 'queued')}
              class="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors {activeNavFilter === 'queued' ? 'bg-primary text-white font-bold shadow-sm' : 'hover:bg-surface-elevated dark:hover:bg-zinc-800/60 text-body dark:text-zinc-300'}"
              title={t('status.queued', currentLang)}
            >
              <Clock class="w-3.5 h-3.5 shrink-0 text-cyan-500" />
              {#if !isSidebarCollapsed}
                <span class="truncate flex-1 text-left">{t('status.queued', currentLang)}</span>
                <span class="px-1.5 py-0.2 rounded-full text-[10px] font-mono {activeNavFilter === 'queued' ? 'bg-white/20 text-white' : 'bg-zinc-100 dark:bg-zinc-800 text-subtle dark:text-zinc-400'}">
                  {statusCounts.queued}
                </span>
              {/if}
            </button>
          </div>
        </div>

        <!-- Categories Section -->
        <div>
          {#if !isSidebarCollapsed}
            <div class="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-subtle dark:text-zinc-500">
              {t('sidebar.categories', currentLang)}
            </div>
          {/if}
          <div class="space-y-0.5 mt-0.5">
            <!-- Videos -->
            <button
              type="button"
              onclick={() => (activeCategory = 'video')}
              class="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors {activeCategory === 'video' ? 'bg-primary text-white font-bold shadow-sm' : 'hover:bg-surface-elevated dark:hover:bg-zinc-800/60 text-body dark:text-zinc-300'}"
              title={t('cat.video', currentLang)}
            >
              <Video class="w-3.5 h-3.5 shrink-0 text-cyan-400" />
              {#if !isSidebarCollapsed}
                <span class="truncate flex-1 text-left">{t('cat.video', currentLang)}</span>
                <span class="px-1.5 py-0.2 rounded-full text-[10px] font-mono {activeCategory === 'video' ? 'bg-white/20 text-white' : 'bg-zinc-100 dark:bg-zinc-800 text-subtle dark:text-zinc-400'}">
                  {categoryCounts.video}
                </span>
              {/if}
            </button>

            <!-- Audio -->
            <button
              type="button"
              onclick={() => (activeCategory = 'audio')}
              class="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors {activeCategory === 'audio' ? 'bg-primary text-white font-bold shadow-sm' : 'hover:bg-surface-elevated dark:hover:bg-zinc-800/60 text-body dark:text-zinc-300'}"
              title={t('cat.audio', currentLang)}
            >
              <Music class="w-3.5 h-3.5 shrink-0 text-emerald-400" />
              {#if !isSidebarCollapsed}
                <span class="truncate flex-1 text-left">{t('cat.audio', currentLang)}</span>
                <span class="px-1.5 py-0.2 rounded-full text-[10px] font-mono {activeCategory === 'audio' ? 'bg-white/20 text-white' : 'bg-zinc-100 dark:bg-zinc-800 text-subtle dark:text-zinc-400'}">
                  {categoryCounts.audio}
                </span>
              {/if}
            </button>

            <!-- Compressed / Archives -->
            <button
              type="button"
              onclick={() => (activeCategory = 'archives')}
              class="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors {activeCategory === 'archives' ? 'bg-primary text-white font-bold shadow-sm' : 'hover:bg-surface-elevated dark:hover:bg-zinc-800/60 text-body dark:text-zinc-300'}"
              title={t('cat.archives', currentLang)}
            >
              <Archive class="w-3.5 h-3.5 shrink-0 text-amber-400" />
              {#if !isSidebarCollapsed}
                <span class="truncate flex-1 text-left">{t('cat.archives', currentLang)}</span>
                <span class="px-1.5 py-0.2 rounded-full text-[10px] font-mono {activeCategory === 'archives' ? 'bg-white/20 text-white' : 'bg-zinc-100 dark:bg-zinc-800 text-subtle dark:text-zinc-400'}">
                  {categoryCounts.archives}
                </span>
              {/if}
            </button>

            <!-- Documents -->
            <button
              type="button"
              onclick={() => (activeCategory = 'documents')}
              class="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors {activeCategory === 'documents' ? 'bg-primary text-white font-bold shadow-sm' : 'hover:bg-surface-elevated dark:hover:bg-zinc-800/60 text-body dark:text-zinc-300'}"
              title={t('cat.documents', currentLang)}
            >
              <FileText class="w-3.5 h-3.5 shrink-0 text-indigo-400" />
              {#if !isSidebarCollapsed}
                <span class="truncate flex-1 text-left">{t('cat.documents', currentLang)}</span>
                <span class="px-1.5 py-0.2 rounded-full text-[10px] font-mono {activeCategory === 'documents' ? 'bg-white/20 text-white' : 'bg-zinc-100 dark:bg-zinc-800 text-subtle dark:text-zinc-400'}">
                  {categoryCounts.documents}
                </span>
              {/if}
            </button>

            <!-- Programs -->
            <button
              type="button"
              onclick={() => (activeCategory = 'programs')}
              class="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors {activeCategory === 'programs' ? 'bg-primary text-white font-bold shadow-sm' : 'hover:bg-surface-elevated dark:hover:bg-zinc-800/60 text-body dark:text-zinc-300'}"
              title={t('cat.programs', currentLang)}
            >
              <AppWindow class="w-3.5 h-3.5 shrink-0 text-violet-400" />
              {#if !isSidebarCollapsed}
                <span class="truncate flex-1 text-left">{t('cat.programs', currentLang)}</span>
                <span class="px-1.5 py-0.2 rounded-full text-[10px] font-mono {activeCategory === 'programs' ? 'bg-white/20 text-white' : 'bg-zinc-100 dark:bg-zinc-800 text-subtle dark:text-zinc-400'}">
                  {categoryCounts.programs}
                </span>
              {/if}
            </button>
          </div>
        </div>
      </div>

      <!-- Bottom Sidebar Info -->
      {#if !isSidebarCollapsed}
        <div class="p-3 border-t border-border-light dark:border-border-dark bg-surface-elevated/50 dark:bg-surface-darkcard/50 text-[11px] text-subtle dark:text-zinc-400">
          <div class="flex items-center gap-2">
            <HardDrive class="w-3.5 h-3.5 text-primary shrink-0" />
            <div class="truncate">
              <span class="font-bold block text-heading dark:text-white truncate">{settings.download_dir}</span>
            </div>
          </div>
        </div>
      {/if}
    </aside>

    <!-- Main Center Area: High-Density Download Table Queue -->
    <main class="flex-1 flex flex-col overflow-hidden bg-canvas dark:bg-canvas-dark">
      <!-- Multi-Select Bulk Action Header (Appears when items are selected) -->
      {#if selectedTaskIds.size > 0}
        <div class="px-4 py-2 bg-primary/10 dark:bg-primary/20 border-b border-primary/20 flex items-center justify-between animate-in fade-in duration-100">
          <div class="flex items-center gap-2 font-semibold text-primary dark:text-indigo-300">
            <span class="px-2 py-0.5 bg-primary text-white rounded font-mono font-bold text-xs">
              {selectedTaskIds.size}
            </span>
            <span>{t('actions.selected_count', currentLang)}</span>
          </div>

          <div class="flex items-center gap-1.5">
            <button
              type="button"
              onclick={handlePauseSelected}
              class="px-2.5 py-1 bg-surface dark:bg-surface-darkcard border border-border-light dark:border-border-dark hover:bg-slate-100 dark:hover:bg-zinc-800 text-heading dark:text-white font-medium rounded-lg flex items-center gap-1 shadow-sm"
            >
              <Pause class="w-3 h-3 text-amber-500" /> {t('actions.pause_selected', currentLang)}
            </button>
            <button
              type="button"
              onclick={handleResumeSelected}
              class="px-2.5 py-1 bg-primary hover:bg-primary-hover text-white font-medium rounded-lg flex items-center gap-1 shadow-sm"
            >
              <Play class="w-3 h-3" /> {t('actions.resume_selected', currentLang)}
            </button>
            <button
              type="button"
              onclick={handleDeleteSelected}
              class="px-2.5 py-1 bg-surface dark:bg-surface-darkcard border border-border-light dark:border-border-dark hover:bg-rose-50 dark:hover:bg-rose-950/40 text-rose-600 dark:text-rose-400 font-medium rounded-lg flex items-center gap-1 shadow-sm"
            >
              <Trash2 class="w-3 h-3" /> {t('actions.delete_selected', currentLang)}
            </button>
          </div>
        </div>
      {/if}

      <!-- Main Download Data Table -->
      <div class="flex-1 overflow-x-auto overflow-y-auto">
        <table class="w-full text-left border-collapse min-w-[780px]">
          <!-- Table Header -->
          <thead class="sticky top-0 z-10 bg-surface-elevated dark:bg-surface-darkelevated border-b border-border-light dark:border-border-dark text-[11px] font-bold text-subtle dark:text-zinc-400 uppercase tracking-wider">
            <tr>
              <!-- Checkbox column -->
              <th class="w-10 px-3 py-2 text-center">
                <input
                  type="checkbox"
                  checked={isAllSelected}
                  onchange={toggleSelectAll}
                  class="rounded accent-primary cursor-pointer"
                  title={t('actions.select_all', currentLang)}
                />
              </th>

              <!-- File Name -->
              <th
                class="px-3 py-2 cursor-pointer hover:text-heading dark:hover:text-white transition-colors"
                onclick={() => handleSort('filename')}
              >
                <div class="flex items-center gap-1">
                  <span>{t('table.filename', currentLang)}</span>
                  {#if sortField === 'filename'}
                    <span class="text-primary font-mono">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                  {/if}
                </div>
              </th>

              <!-- Size -->
              <th
                class="w-24 px-3 py-2 cursor-pointer hover:text-heading dark:hover:text-white transition-colors text-right"
                onclick={() => handleSort('total_size')}
              >
                <div class="flex items-center justify-end gap-1">
                  <span>{t('table.size', currentLang)}</span>
                  {#if sortField === 'total_size'}
                    <span class="text-primary font-mono">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                  {/if}
                </div>
              </th>

              <!-- Progress Bar -->
              <th class="w-44 px-3 py-2">
                <span>{t('table.progress', currentLang)}</span>
              </th>

              <!-- Transfer Speed -->
              <th class="w-28 px-3 py-2 text-right">
                <span>{t('table.speed', currentLang)}</span>
              </th>

              <!-- Status -->
              <th
                class="w-28 px-3 py-2 cursor-pointer hover:text-heading dark:hover:text-white transition-colors"
                onclick={() => handleSort('status')}
              >
                <div class="flex items-center gap-1">
                  <span>{t('table.status', currentLang)}</span>
                  {#if sortField === 'status'}
                    <span class="text-primary font-mono">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                  {/if}
                </div>
              </th>

              <!-- ETA -->
              <th class="w-20 px-3 py-2 text-right">
                <span>{t('table.eta', currentLang)}</span>
              </th>

              <!-- Added Date -->
              <th
                class="w-32 px-3 py-2 cursor-pointer hover:text-heading dark:hover:text-white transition-colors"
                onclick={() => handleSort('created_at')}
              >
                <div class="flex items-center gap-1">
                  <span>{t('table.added', currentLang)}</span>
                  {#if sortField === 'created_at'}
                    <span class="text-primary font-mono">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                  {/if}
                </div>
              </th>

              <!-- Actions -->
              <th class="w-28 px-3 py-2 text-center">
                <span>{t('table.actions', currentLang)}</span>
              </th>
            </tr>
          </thead>

          <!-- Table Body -->
          <tbody class="divide-y divide-border-light dark:divide-border-dark font-sans text-xs">
            {#if filteredTasks.length === 0}
              <tr>
                <td colspan="9" class="py-20 text-center text-subtle dark:text-zinc-500">
                  <div class="flex flex-col items-center justify-center max-w-sm mx-auto">
                    <div class="w-12 h-12 rounded-2xl bg-surface-elevated dark:bg-surface-darkcard border border-border-light dark:border-border-dark flex items-center justify-center mb-3 text-subtle dark:text-zinc-500">
                      <Download class="w-6 h-6" />
                    </div>
                    <p class="font-bold text-sm text-heading dark:text-white">{t('cat.empty_title', currentLang)}</p>
                    <p class="text-xs text-subtle dark:text-zinc-400 mt-1 mb-4">{t('cat.empty_sub', currentLang)}</p>
                    <button
                      type="button"
                      onclick={() => (isAddModalOpen = true)}
                      class="px-4 py-2 bg-primary hover:bg-primary-hover text-white font-semibold rounded-lg shadow-sm flex items-center gap-1.5"
                    >
                      <Plus class="w-4 h-4" />
                      <span>{t('cat.empty_cta', currentLang)}</span>
                    </button>
                  </div>
                </td>
              </tr>
            {:else}
              {#each filteredTasks as task (task.id)}
                {@const isSelected = selectedTaskIds.has(task.id)}
                {@const isFocused = focusedTaskId === task.id}
                {@const badge = getStatusBadge(task.status)}
                {@const cat = getFileCategory(task.filename)}
                {@const CatIcon = getCategoryIcon(cat)}
                {@const speed = taskSpeedMap[task.id] || 0}
                {@const pct = task.total_size && task.total_size > 0
                  ? Math.min(100, (task.downloaded_size / task.total_size) * 100)
                  : (task.status === 'Completed' ? 100 : 0)}

                <tr
                  class="group cursor-pointer transition-colors duration-100 select-none {isSelected ? 'bg-primary/10 dark:bg-indigo-950/40 text-heading dark:text-white' : 'hover:bg-slate-50 dark:hover:bg-zinc-800/40 text-body dark:text-zinc-300'}"
                  onclick={(e) => handleRowClick(e, task.id)}
                  oncontextmenu={(e) => handleContextMenu(e, task.id)}
                  ondblclick={() => openProgressPopout(task.id)}
                >
                  <!-- Selection Checkbox -->
                  <td class="px-3 py-2 text-center" onclick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onchange={() => {
                        const next = new Set(selectedTaskIds);
                        if (next.has(task.id)) next.delete(task.id);
                        else next.add(task.id);
                        selectedTaskIds = next;
                        focusedTaskId = task.id;
                      }}
                      class="rounded accent-primary cursor-pointer"
                    />
                  </td>

                  <!-- File Name & Category Icon -->
                  <td class="px-3 py-2 min-w-[200px] max-w-[320px]">
                    <div class="flex items-center gap-2.5">
                      <div class="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 {isSelected ? 'bg-primary text-white' : 'bg-surface-elevated dark:bg-surface-darkcard text-subtle dark:text-zinc-400 border border-border-light dark:border-border-dark'}">
                        <CatIcon class="w-3.5 h-3.5" />
                      </div>
                      <div class="min-w-0 flex-1">
                        <div class="font-bold text-heading dark:text-white truncate" title={task.filename}>
                          {task.filename}
                        </div>
                        <div class="text-[10px] font-mono text-subtle dark:text-zinc-500 truncate" title={task.url}>
                          {task.url}
                        </div>
                      </div>
                    </div>
                  </td>

                  <!-- Size -->
                  <td class="px-3 py-2 text-right font-mono text-[11px] whitespace-nowrap">
                    <span class="font-bold text-heading dark:text-zinc-200">{formatBytes(task.total_size)}</span>
                  </td>

                  <!-- Progress Bar & Percentage -->
                  <td class="px-3 py-2">
                    <div class="space-y-1">
                      <div class="flex items-center justify-between font-mono text-[10px]">
                        <span class="text-subtle dark:text-zinc-400">{formatBytes(task.downloaded_size)}</span>
                        <span class="font-bold text-heading dark:text-zinc-200">{pct.toFixed(1)}%</span>
                      </div>
                      <div class="w-full bg-slate-200 dark:bg-zinc-800 rounded-full h-1.5 overflow-hidden">
                        <div
                          class="h-full rounded-full transition-all duration-300 {task.status === 'Completed' ? 'bg-emerald-500' : 'bg-gradient-to-r from-primary to-secondary'}"
                          style="width: {pct}%"
                        ></div>
                      </div>
                    </div>
                  </td>

                  <!-- Transfer Speed -->
                  <td class="px-3 py-2 text-right font-mono text-[11px] whitespace-nowrap">
                    {#if task.status === 'Downloading'}
                      <span class="font-extrabold text-secondary">{formatSpeed(speed)}</span>
                    {:else}
                      <span class="text-subtle dark:text-zinc-500">-</span>
                    {/if}
                  </td>

                  <!-- Status Badge -->
                  <td class="px-3 py-2 whitespace-nowrap">
                    <span class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full font-mono text-[10px] font-bold border {badge.bg}">
                      <span class="w-1.5 h-1.5 rounded-full {badge.dot}"></span>
                      <span>{badge.label}</span>
                    </span>
                  </td>

                  <!-- ETA -->
                  <td class="px-3 py-2 text-right font-mono text-[11px] text-subtle dark:text-zinc-400 whitespace-nowrap">
                    {formatEta(task, speed)}
                  </td>

                  <!-- Added Date -->
                  <td class="px-3 py-2 font-mono text-[11px] text-subtle dark:text-zinc-400 whitespace-nowrap">
                    {formatDate(task.created_at)}
                  </td>

                  <!-- Row Actions -->
                  <td class="px-3 py-2 text-center whitespace-nowrap" onclick={(e) => e.stopPropagation()}>
                    <div class="flex items-center justify-center gap-1">
                      {#if task.status === 'Downloading'}
                        <button
                          type="button"
                          onclick={() => handlePause(task.id)}
                          class="p-1 rounded hover:bg-slate-200 dark:hover:bg-zinc-700 text-subtle dark:text-zinc-300 hover:text-amber-500 transition-colors"
                          title={t('inspect.pause', currentLang)}
                        >
                          <Pause class="w-3.5 h-3.5" />
                        </button>
                      {:else if task.status === 'Paused' || task.status === 'Queued' || task.status === 'Failed'}
                        <button
                          type="button"
                          onclick={() => handleResume(task.id)}
                          class="p-1 rounded hover:bg-slate-200 dark:hover:bg-zinc-700 text-primary dark:text-indigo-400 transition-colors"
                          title={t('inspect.resume', currentLang)}
                        >
                          <Play class="w-3.5 h-3.5" />
                        </button>
                      {/if}

                      <button
                        type="button"
                        onclick={() => openProgressPopout(task.id)}
                        class="p-1 rounded hover:bg-slate-200 dark:hover:bg-zinc-700 text-subtle dark:text-zinc-400 hover:text-primary transition-colors"
                        title={t('ctx.popout', currentLang)}
                      >
                        <ExternalLink class="w-3.5 h-3.5" />
                      </button>

                      <button
                        type="button"
                        onclick={() => handleDelete(task.id)}
                        class="p-1 rounded hover:bg-rose-100 dark:hover:bg-rose-950/50 text-subtle dark:text-zinc-400 hover:text-rose-600 dark:hover:text-rose-400 transition-colors"
                        title={t('ctx.delete', currentLang)}
                      >
                        <Trash2 class="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              {/each}
            {/if}
          </tbody>
        </table>
      </div>

      <!-- Right-Click Context Menu -->
      {#if contextMenu.visible && contextMenu.taskId}
        {@const ctxTask = tasks.find((t) => t.id === contextMenu.taskId)}
        {#if ctxTask}
          <div
            id="context-menu-container"
            class="fixed z-50 w-52 bg-surface dark:bg-surface-darkcard rounded-xl border border-border-light dark:border-border-dark shadow-2xl p-1.5 animate-in fade-in zoom-in-95 duration-100 text-xs"
            style="left: {contextMenu.x}px; top: {contextMenu.y}px;"
          >
            {#if ctxTask.status === 'Downloading'}
              <button
                type="button"
                onclick={() => { handlePause(ctxTask.id); closeContextMenu(); }}
                class="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-zinc-800 text-heading dark:text-white font-medium text-left"
              >
                <Pause class="w-3.5 h-3.5 text-amber-500" />
                <span>{t('ctx.pause', currentLang)}</span>
              </button>
            {:else}
              <button
                type="button"
                onclick={() => { handleResume(ctxTask.id); closeContextMenu(); }}
                class="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-zinc-800 text-heading dark:text-white font-medium text-left"
              >
                <Play class="w-3.5 h-3.5 text-primary" />
                <span>{t('ctx.resume', currentLang)}</span>
              </button>
            {/if}

            <button
              type="button"
              onclick={() => { openProgressPopout(ctxTask.id); closeContextMenu(); }}
              class="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-zinc-800 text-heading dark:text-white font-medium text-left"
            >
              <ExternalLink class="w-3.5 h-3.5 text-secondary" />
              <span>{t('ctx.popout', currentLang)}</span>
            </button>

            <button
              type="button"
              onclick={() => { openContainingFolder(ctxTask.save_path); closeContextMenu(); }}
              class="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-zinc-800 text-heading dark:text-white font-medium text-left"
            >
              <FolderOpen class="w-3.5 h-3.5 text-indigo-400" />
              <span>{t('ctx.open_folder', currentLang)}</span>
            </button>

            <button
              type="button"
              onclick={() => { copyUrl(ctxTask.url); closeContextMenu(); }}
              class="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-zinc-800 text-heading dark:text-white font-medium text-left"
            >
              <Copy class="w-3.5 h-3.5 text-cyan-400" />
              <span>{t('ctx.copy_url', currentLang)}</span>
            </button>

            <div class="my-1 border-t border-border-light dark:border-border-dark"></div>

            <button
              type="button"
              onclick={() => { handleDelete(ctxTask.id); closeContextMenu(); }}
              class="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/40 text-rose-600 dark:text-rose-400 font-medium text-left"
            >
              <Trash2 class="w-3.5 h-3.5" />
              <span>{t('ctx.delete', currentLang)}</span>
            </button>
          </div>
        {/if}
      {/if}
    </main>
  </div>

  <!-- Bottom App Status Bar -->
  <footer class="h-7 bg-surface dark:bg-surface-dark border-t border-border-light dark:border-border-dark flex items-center justify-between px-3 text-[11px] text-subtle dark:text-zinc-400 shrink-0 font-mono">
    <div class="flex items-center gap-3">
      <div class="flex items-center gap-1.5">
        <span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
        <span class="font-sans font-semibold text-heading dark:text-zinc-300">{t('footer.engine_status', currentLang)}</span>
      </div>
      <span>•</span>
      <span>{tasks.length} {t('footer.total_tasks', currentLang)}</span>
      <span>•</span>
      <span>{totalActiveDownloads} {t('footer.active', currentLang)}</span>
    </div>

    <div class="flex items-center gap-3">
      <div class="flex items-center gap-1">
        <span>{t('footer.total_speed', currentLang)}:</span>
        <strong class="text-secondary font-bold font-mono">{formatSpeed(totalLiveSpeed)}</strong>
      </div>
      <span>•</span>
      <span class="text-primary font-bold">WAL SQLite</span>
    </div>
  </footer>

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
