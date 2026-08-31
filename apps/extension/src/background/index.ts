const NATIVE_HOST = 'com.segmenta.downloader';
const DESKTOP_HTTP_ENDPOINT = 'http://127.0.0.1:45678/api/tasks';
const DESKTOP_PING_ENDPOINT = 'http://127.0.0.1:45678/ping';

// Comprehensive IDM-style interceptable file extensions list
const INTERCEPT_EXTENSIONS = new Set([
  // Archives & Disk Images & Containers
  'zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz', 'iso', 'dmg', 'pkg', 'tgz', 'tbz2', 'z', 'cab', 'lz', 'lzma', 'lzh', 'wim', 'swm', 'esd', 'vhd', 'vhdx', 'vmdk', 'qcow2', 'img',
  // Executables & Installers & Scripts & Packages
  'exe', 'msi', 'bin', 'deb', 'rpm', 'apk', 'appimage', 'jar', 'run', 'cmd', 'bat', 'vbs', 'ps1', 'sh', 'msix', 'appx', 'xapk', 'crx', 'xpi',
  // Documents & Spreadsheets & Presentations & Publishing
  'pdf', 'docx', 'doc', 'xlsx', 'xls', 'pptx', 'ppt', 'epub', 'mobi', 'azw3', 'csv', 'tsv', 'psd', 'ai', 'indd', 'txt', 'rtf', 'odt', 'ods', 'odp', 'pages', 'numbers', 'key',
  // Video Media & Containers
  'mp4', 'mkv', 'avi', 'mov', 'wmv', 'flv', 'webm', 'm4v', '3gp', 'ts', 'm2ts', 'mts', 'vob', 'ogv', 'f4v', 'divx', 'xvid', 'asf', 'rm', 'rmvb',
  // Audio Media & Lossless
  'mp3', 'flac', 'wav', 'aac', 'ogg', 'oga', 'wma', 'm4a', 'opus', 'aiff', 'alac', 'mid', 'midi', 'ape', 'wv', 'mka',
  // Torrents & ROMs & Misc Binaries
  'torrent', 'rom', 'nes', 'sfc', 'gba', 'nds', '3ds', 'nso', 'nsp', 'xci', 'cue', 'bin'
]);

export interface StreamVariant {
  resolution?: string;
  bandwidth?: number;
  quality?: string;
  url: string;
  mimeType?: string;
}

export interface StreamItem {
  id: string;
  url: string;
  type: 'hls' | 'dash' | 'direct' | 'chunk' | 'youtube';
  mimeType?: string;
  title: string;
  quality?: string;
  resolution?: string;
  fileSize?: string;
  tabId?: number;
  detectedAt: number;
  pageUrl?: string;
  variants?: StreamVariant[];
}

export interface TaskPayload {
  url: string;
  filename?: string;
  save_path?: string;
  headers: Record<string, string>;
  segments: number;
  media_type?: 'hls' | 'dash' | 'direct' | 'blob' | 'youtube';
}

export interface NativeMessage {
  type: string;
  payload?: TaskPayload;
  task_id?: string;
  stream?: StreamItem;
  streams?: StreamItem[];
}

export interface RecentDownloadItem {
  id: string;
  url: string;
  filename: string;
  fileSize?: string;
  timestamp: number;
  mediaType?: string;
  status?: string;
}

// In-memory tab streams cache (tabId -> StreamItem[])
const tabStreamsMap = new Map<number, StreamItem[]>();

// Track URLs currently being dispatched to prevent interception loops
const inFlightDispatches = new Set<string>();

// Track handled download item IDs to prevent duplicate handling across onCreated & onDeterminingFilename
const handledDownloadIds = new Set<number>();

// Cache Content-Disposition headers detected in webRequest layer
const urlContentDispositionMap = new Map<string, { filename: string; timestamp: number }>();

// Store auto interception flag (default true)
let autoIntercept = true;

// Initialize settings from storage
chrome.storage.local.get(['auto_intercept'], (res) => {
  if (typeof res.auto_intercept === 'boolean') {
    autoIntercept = res.auto_intercept;
  } else {
    chrome.storage.local.set({ auto_intercept: true });
  }
});

// Listen for storage changes
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.auto_intercept) {
    autoIntercept = !!changes.auto_intercept.newValue;
  }
});

// Clean up tab streams cache when tab closed
chrome.tabs.onRemoved.addListener((tabId) => {
  tabStreamsMap.delete(tabId);
});

// Clean up or reset streams when tab navigates
chrome.webNavigation?.onCommitted?.addListener((details) => {
  if (details.frameId === 0) {
    tabStreamsMap.set(details.tabId, []);
  }
});

// Clean up old Content-Disposition map entries every 2 minutes
setInterval(() => {
  const now = Date.now();
  for (const [url, entry] of urlContentDispositionMap.entries()) {
    if (now - entry.timestamp > 60000) {
      urlContentDispositionMap.delete(url);
    }
  }
}, 120000);

// =========================================================================
// Sanitization & Filename Extraction Helpers
// =========================================================================
export function sanitizeFilename(filename: string): string {
  if (!filename) return 'download.bin';
  let clean = filename.split('?')[0].split('#')[0];
  clean = clean.split(/[\\/]/).pop() || clean;
  clean = clean.replace(/[\\/:*?"<>|]/g, '_').trim();
  clean = clean.replace(/^["']|["']$/g, '');
  return clean || 'download.bin';
}

export function isGenericFilename(name: string): boolean {
  if (!name || !name.trim()) return true;
  const lower = name.trim().toLowerCase();
  const genericNames = [
    'download',
    'download.bin',
    'download.octet-stream',
    'download.mp4',
    'download.zip',
    'videoplayback',
    'media_stream.mp4',
    'video.mp4',
    'file',
    'file.bin',
    'document',
    'stream',
    'stream.mp4',
    'stream.bin',
  ];
  if (genericNames.includes(lower)) return true;
  if (!lower.includes('.') || lower.startsWith('download.')) return true;
  return false;
}

export function extractFilenameFromUrl(urlStr: string): string | undefined {
  try {
    const parsed = new URL(urlStr);
    const lastSeg = parsed.pathname.split('/').filter(Boolean).pop();
    if (lastSeg && lastSeg.includes('.')) {
      const decoded = decodeURIComponent(lastSeg.split('?')[0].split('#')[0]);
      const clean = sanitizeFilename(decoded);
      if (!isGenericFilename(clean)) {
        return clean;
      }
    }
  } catch {
    // ignore
  }
  return undefined;
}

// Helper to extract file extension from URL or filename
export function getFileExtension(url: string, filename?: string): string {
  if (filename) {
    const parts = filename.split('.');
    if (parts.length > 1) {
      return parts.pop()!.toLowerCase().trim();
    }
  }

  try {
    const pathname = new URL(url).pathname;
    const cleanPath = pathname.split('?')[0].split('#')[0];
    const parts = cleanPath.split('.');
    if (parts.length > 1) {
      return parts.pop()!.toLowerCase().trim();
    }
  } catch {
    const cleanUrl = url.split('?')[0].split('#')[0];
    const parts = cleanUrl.split('.');
    if (parts.length > 1) {
      return parts.pop()!.toLowerCase().trim();
    }
  }
  return '';
}

// Extract filename from Content-Disposition header
export function getFilenameFromContentDisposition(headers?: chrome.webRequest.HttpHeader[]): string | undefined {
  if (!headers) return undefined;
  const cdHeader = headers.find((h) => h.name.toLowerCase() === 'content-disposition');
  if (!cdHeader || !cdHeader.value) return undefined;

  const value = cdHeader.value;
  const matchStar = /filename\*=UTF-8''([^;]+)/i.exec(value);
  if (matchStar && matchStar[1]) {
    try {
      const decoded = decodeURIComponent(matchStar[1].trim());
      return sanitizeFilename(decoded);
    } catch {
      return sanitizeFilename(matchStar[1].trim());
    }
  }

  const matchQuoted = /filename="([^"]+)"/i.exec(value);
  if (matchQuoted && matchQuoted[1]) {
    return sanitizeFilename(matchQuoted[1].trim());
  }

  const matchUnquoted = /filename=([^;]+)/i.exec(value);
  if (matchUnquoted && matchUnquoted[1]) {
    return sanitizeFilename(matchUnquoted[1].trim().replace(/^["']|["']$/g, ''));
  }

  return undefined;
}

// Extract clean target filename from download item
export function extractFilenameFromDownloadItem(item: chrome.downloads.DownloadItem): string {
  if (item.filename && item.filename.trim() && !item.filename.endsWith('.crdownload')) {
    const base = item.filename.split(/[\\/]/).pop();
    if (base && base.trim()) {
      const clean = sanitizeFilename(base);
      if (!isGenericFilename(clean)) {
        return clean;
      }
    }
  }

  // Check Content-Disposition cache
  const cdEntry = urlContentDispositionMap.get(item.url);
  if (cdEntry && cdEntry.filename && !isGenericFilename(cdEntry.filename)) {
    return sanitizeFilename(cdEntry.filename);
  }

  // Check URL pathname
  const fromUrl = extractFilenameFromUrl(item.url);
  if (fromUrl) {
    return fromUrl;
  }

  const ext = getFileExtension(item.url, item.filename);
  return ext ? `download.${ext}` : 'download.bin';
}

// Determine if a download item matches interceptable criteria
export function shouldInterceptDownloadItem(item: chrome.downloads.DownloadItem): boolean {
  if (!item.url || !item.url.startsWith('http')) return false;

  try {
    const u = new URL(item.url);
    if (u.hostname === '127.0.0.1' || u.hostname === 'localhost') {
      return false;
    }
  } catch {
    return false;
  }

  const filename = item.filename ? item.filename.split(/[\\/]/).pop() : undefined;
  const ext = getFileExtension(item.url, filename);
  if (ext && INTERCEPT_EXTENSIONS.has(ext)) {
    return true;
  }

  if (item.mime) {
    const m = item.mime.toLowerCase();
    if (
      m.startsWith('video/') ||
      m.startsWith('audio/') ||
      m.startsWith('application/x-') ||
      m.startsWith('application/octet-stream') ||
      m.includes('zip') ||
      m.includes('rar') ||
      m.includes('7z') ||
      m.includes('tar') ||
      m.includes('gzip') ||
      m.includes('compressed') ||
      m.includes('pdf') ||
      m.includes('msword') ||
      m.includes('officedocument') ||
      m.includes('vnd.openxmlformats') ||
      m.includes('executable') ||
      m.includes('iso')
    ) {
      return true;
    }
  }

  return false;
}

// =========================================================================
// Context Menu Integration: "Download with Segmenta"
// =========================================================================
function setupContextMenus() {
  chrome.contextMenus?.removeAll(() => {
    // 1. Download Link
    chrome.contextMenus.create({
      id: 'segmenta-download-link',
      title: 'Download with Segmenta',
      contexts: ['link'],
    });

    // 2. Download Media (Image / Video / Audio)
    chrome.contextMenus.create({
      id: 'segmenta-download-media',
      title: 'Download Media with Segmenta',
      contexts: ['image', 'video', 'audio'],
    });

    // 3. Download Current Page Media
    chrome.contextMenus.create({
      id: 'segmenta-download-page',
      title: 'Grab All Media on this Page',
      contexts: ['page'],
    });
  });
}

chrome.runtime.onInstalled.addListener(() => {
  setupContextMenus();
});

chrome.runtime.onStartup.addListener(() => {
  setupContextMenus();
});

chrome.contextMenus?.onClicked.addListener((info, tab) => {
  const pageUrl = tab?.url || info.pageUrl || '';

  if (info.menuItemId === 'segmenta-download-link' && info.linkUrl) {
    interceptAndDispatchUrl(info.linkUrl, pageUrl, undefined, tab?.id);
  } else if (info.menuItemId === 'segmenta-download-media' && (info.srcUrl || info.linkUrl)) {
    const targetUrl = info.srcUrl || info.linkUrl || '';
    interceptAndDispatchUrl(targetUrl, pageUrl, undefined, tab?.id);
  } else if (info.menuItemId === 'segmenta-download-page' && tab?.id) {
    // Request content script to trigger grabber scan
    chrome.scripting?.executeScript({
      target: { tabId: tab.id },
      func: () => {
        window.postMessage({ type: 'SEGMENTA_TRIGGER_SCAN' }, '*');
      },
    });
  }
});

// Helper to record stream item for tab
function recordDetectedStream(tabId: number, stream: StreamItem) {
  const list = tabStreamsMap.get(tabId) || [];
  if (!list.some((s) => s.url === stream.url)) {
    list.unshift(stream);
    // Keep max 30 streams per tab
    if (list.length > 30) list.pop();
    tabStreamsMap.set(tabId, list);

    // Also persist detected streams to storage for active tab inspection
    chrome.storage.local.set({ [`tab_streams_${tabId}`]: list });

    // Inform popup or content script if open
    chrome.runtime.sendMessage({
      type: 'STREAM_DETECTED',
      tabId,
      stream,
    }).catch(() => {
      // Popup not open, ignore error
    });

    // Notify native host about stream detection if master/playlist or direct video
    if (stream.type === 'hls' || stream.type === 'dash' || stream.type === 'direct' || stream.type === 'youtube') {
      dispatchToNativeAndDesktop({
        type: 'MEDIA_STREAM_DETECTED',
        stream,
      });
    }
  }
}

// Parse quality or resolution from URL or headers
function guessQualityFromUrl(url: string, mime?: string): string {
  const lower = url.toLowerCase();
  if (lower.includes('2160p') || lower.includes('4k') || lower.includes('3840x2160')) return '4K';
  if (lower.includes('1440p') || lower.includes('2k') || lower.includes('2560x1440')) return '1440p';
  if (lower.includes('1080p') || lower.includes('1920x1080') || lower.includes('itag=137') || lower.includes('itag=248')) return '1080p HD';
  if (lower.includes('720p') || lower.includes('1280x720') || lower.includes('itag=22') || lower.includes('itag=136')) return '720p HD';
  if (lower.includes('480p') || lower.includes('854x480') || lower.includes('itag=135')) return '480p';
  if (lower.includes('360p') || lower.includes('640x360') || lower.includes('itag=18') || lower.includes('itag=134')) return '360p';
  if (lower.includes('audio') || lower.includes('itag=140') || lower.includes('itag=251') || (mime && mime.startsWith('audio/'))) return 'Audio';
  if (lower.includes('.m3u8')) return 'HLS Multi';
  if (lower.includes('.mpd')) return 'DASH';
  return 'HD';
}

// Helper to check if URL is an HLS, DASH, direct media, or video chunk
function isStreamOrChunkUrl(url: string, responseHeaders?: chrome.webRequest.HttpHeader[]): { isMatch: boolean; type: 'hls' | 'dash' | 'chunk' | 'direct' | 'youtube'; mime?: string } {
  const lowerUrl = url.toLowerCase();

  // Header inspection
  let contentType = '';
  if (responseHeaders) {
    const ctHeader = responseHeaders.find((h) => h.name.toLowerCase() === 'content-type');
    if (ctHeader && ctHeader.value) {
      contentType = ctHeader.value.toLowerCase();
    }
  }

  // YouTube stream URLs detection
  if (
    lowerUrl.includes('googlevideo.com/videoplayback') ||
    lowerUrl.includes('youtube.com/api/stats/playback')
  ) {
    if (lowerUrl.includes('googlevideo.com/videoplayback')) {
      return { isMatch: true, type: 'youtube', mime: contentType || 'video/mp4' };
    }
  }

  if (
    lowerUrl.includes('.m3u8') ||
    contentType.includes('application/x-mpegurl') ||
    contentType.includes('application/vnd.apple.mpegurl')
  ) {
    return { isMatch: true, type: 'hls', mime: contentType || 'application/vnd.apple.mpegurl' };
  }

  if (
    lowerUrl.includes('.mpd') ||
    contentType.includes('application/dash+xml')
  ) {
    return { isMatch: true, type: 'dash', mime: contentType || 'application/dash+xml' };
  }

  if (
    lowerUrl.includes('.ts') ||
    lowerUrl.includes('.m4s') ||
    contentType.includes('video/mp2t') ||
    contentType.includes('video/iso.segment')
  ) {
    return { isMatch: true, type: 'chunk', mime: contentType || 'video/mp2t' };
  }

  if (
    lowerUrl.includes('.mp4') ||
    lowerUrl.includes('.webm') ||
    lowerUrl.includes('.mkv') ||
    lowerUrl.includes('.mov') ||
    lowerUrl.includes('.avi') ||
    lowerUrl.includes('.mp3') ||
    lowerUrl.includes('.flac') ||
    lowerUrl.includes('.wav') ||
    lowerUrl.includes('.aac') ||
    lowerUrl.includes('.m4a') ||
    contentType.includes('video/mp4') ||
    contentType.includes('video/webm') ||
    contentType.includes('video/quicktime') ||
    contentType.includes('audio/mpeg') ||
    contentType.includes('audio/mp4') ||
    contentType.includes('audio/flac') ||
    contentType.includes('audio/aac')
  ) {
    return { isMatch: true, type: 'direct', mime: contentType || 'video/mp4' };
  }

  return { isMatch: false, type: 'direct' };
}

// Show desktop/browser notification when Segmenta takes over a download
function showSegmentaNotification(title: string, message: string) {
  try {
    if (chrome.notifications && chrome.notifications.create) {
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon128.png',
        title: `Segmenta — ${title}`,
        message,
        priority: 2,
      });
    }
  } catch (err) {
    console.warn('Failed to display browser notification:', err);
  }
}

// Helper to extract cookies, headers, and immediately dispatch task to Segmenta Core
export function interceptAndDispatchUrl(
  downloadUrl: string,
  referrerUrl?: string,
  preferredFilename?: string,
  tabId?: number,
  callback?: (response: unknown) => void
) {
  if (!downloadUrl || !downloadUrl.startsWith('http')) return;

  // Deduplicate rapid identical dispatches (within 2.5 seconds)
  if (inFlightDispatches.has(downloadUrl)) return;
  inFlightDispatches.add(downloadUrl);
  setTimeout(() => inFlightDispatches.delete(downloadUrl), 2500);

  let finalFilename = preferredFilename ? sanitizeFilename(preferredFilename) : undefined;
  if (!finalFilename || isGenericFilename(finalFilename)) {
    const cdEntry = urlContentDispositionMap.get(downloadUrl);
    if (cdEntry && cdEntry.filename && !isGenericFilename(cdEntry.filename)) {
      finalFilename = sanitizeFilename(cdEntry.filename);
    }
  }
  if (!finalFilename || isGenericFilename(finalFilename)) {
    const fromUrl = extractFilenameFromUrl(downloadUrl);
    if (fromUrl) {
      finalFilename = fromUrl;
    }
  }
  if (!finalFilename) {
    const ext = getFileExtension(downloadUrl);
    finalFilename = ext ? `download.${ext}` : 'download.bin';
  }

  // Capture complete cookies from 'chrome.cookies.getAll({ url: item.url })', Referer from item.referrer, User-Agent.
  chrome.cookies.getAll({ url: downloadUrl }, (cookies) => {
    const cookieHeader = cookies && cookies.length > 0 ? cookies.map((c) => `${c.name}=${c.value}`).join('; ') : '';

    const payload: NativeMessage = {
      type: 'CREATE_TASK',
      payload: {
        url: downloadUrl,
        filename: finalFilename,
        headers: {
          Cookie: cookieHeader,
          'User-Agent': navigator.userAgent,
          Referer: referrerUrl || '',
        },
        segments: 8,
      },
    };

    // Save to recent downloads list in extension storage
    saveRecentDownload({
      id: String(Date.now()),
      url: downloadUrl,
      filename: finalFilename || 'download.bin',
      timestamp: Date.now(),
      status: 'Segmented Acceleration Active',
    });

    // Show desktop/browser notification confirming interception
    showSegmentaNotification(
      'Download Intercepted',
      `Segmenta has taken over: "${finalFilename}" with 8-segment acceleration.`
    );

    // Dispatch to 'http://127.0.0.1:45678/api/tasks' (and native messaging host)
    dispatchToNativeAndDesktop(payload, callback);
  });
}

// Process intercepted download item (deduplicated across onCreated & onDeterminingFilename)
function processInterceptedDownload(item: chrome.downloads.DownloadItem) {
  if (handledDownloadIds.has(item.id)) return;
  handledDownloadIds.add(item.id);
  setTimeout(() => handledDownloadIds.delete(item.id), 15000);

  const cleanFilename = extractFilenameFromDownloadItem(item);
  interceptAndDispatchUrl(item.url, item.referrer, cleanFilename);
}

// =========================================================================
// 1. WebRequest Layer: Early Sniffing & Header-based Interception
// =========================================================================
chrome.webRequest.onHeadersReceived.addListener(
  (details) => {
    if (!details.url || !details.url.startsWith('http')) return;
    const tabId = details.tabId;
    if (tabId < 0) return;

    // A. Check for Streaming Media (HLS, DASH, YouTube, Direct Video Chunks)
    const streamCheck = isStreamOrChunkUrl(details.url, details.responseHeaders);
    if (streamCheck.isMatch) {
      const urlObj = new URL(details.url);
      const cleanPath = urlObj.pathname.split('/').pop() || '';
      let filename = cleanPath;

      if (!filename || filename === 'videoplayback' || filename === 'playlist' || filename.length < 3) {
        if (streamCheck.type === 'youtube') {
          filename = 'YouTube_Video';
        } else if (streamCheck.type === 'hls') {
          filename = 'HLS_Stream.m3u8';
        } else if (streamCheck.type === 'dash') {
          filename = 'DASH_Stream.mpd';
        } else {
          filename = 'media_stream.mp4';
        }
      }

      const quality = guessQualityFromUrl(details.url, streamCheck.mime);

      const stream: StreamItem = {
        id: `${tabId}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        url: details.url,
        type: streamCheck.type,
        mimeType: streamCheck.mime,
        title: filename,
        quality,
        resolution: quality,
        tabId,
        detectedAt: Date.now(),
        pageUrl: details.initiator || '',
      };

      recordDetectedStream(tabId, stream);
    }

    // B. Check for Content-Disposition attachment downloads on standard HTTP web requests
    if (autoIntercept && details.responseHeaders) {
      const cdFilename = getFilenameFromContentDisposition(details.responseHeaders);
      if (cdFilename) {
        urlContentDispositionMap.set(details.url, {
          filename: cdFilename,
          timestamp: Date.now(),
        });
      }
    }
  },
  { urls: ['<all_urls>'] },
  ['responseHeaders']
);

// =========================================================================
// 2. Universal Download Interception:
//    Listen to 'chrome.downloads.onCreated(item)' AND 'chrome.downloads.onDeterminingFilename(item, suggest)'
// =========================================================================

// A. chrome.downloads.onDeterminingFilename
if (chrome.downloads?.onDeterminingFilename) {
  chrome.downloads.onDeterminingFilename.addListener((item, suggest) => {
    if (!autoIntercept) return;
    if (!shouldInterceptDownloadItem(item)) return;

    // In 'onDeterminingFilename', if auto-intercept is on, IMMEDIATELY call 'chrome.downloads.cancel(item.id)' and 'chrome.downloads.erase({ id: item.id })'
    chrome.downloads.cancel(item.id, () => {
      if (chrome.runtime.lastError) {
        // ignore
      }
      chrome.downloads.erase({ id: item.id }, () => {});
    });

    processInterceptedDownload(item);
  });
}

// B. chrome.downloads.onCreated
if (chrome.downloads?.onCreated) {
  chrome.downloads.onCreated.addListener((downloadItem) => {
    if (!autoIntercept) return;
    if (!shouldInterceptDownloadItem(downloadItem)) return;

    // Instantly cancel and erase browser download to prevent browser holding the file
    chrome.downloads.cancel(downloadItem.id, () => {
      if (chrome.runtime.lastError) {
        // ignore
      }
      chrome.downloads.erase({ id: downloadItem.id }, () => {});
    });

    processInterceptedDownload(downloadItem);
  });
}

function saveRecentDownload(item: RecentDownloadItem) {
  chrome.storage.local.get(['recent_downloads'], (res) => {
    const recent: RecentDownloadItem[] = res.recent_downloads || [];
    // Remove if already exists with same URL or ID
    const filtered = recent.filter((r) => r.url !== item.url && r.id !== item.id);
    filtered.unshift(item);
    if (filtered.length > 25) filtered.pop();
    chrome.storage.local.set({ recent_downloads: filtered });
  });
}

export interface HostStatusResponse {
  type?: string;
  status?: string;
  version?: string;
  error?: string;
  connected?: boolean;
  source?: 'native' | 'http';
}

// Check connection status against Native Messaging AND 127.0.0.1:45678 /ping
export function checkConnectionStatus(callback: (res: HostStatusResponse) => void) {
  let finished = false;

  // 1. Try Desktop HTTP endpoint first
  fetch(DESKTOP_PING_ENDPOINT, { method: 'GET' })
    .then((r) => {
      if (!r.ok) throw new Error(`HTTP status ${r.status}`);
      return r.json();
    })
    .then((data: any) => {
      if (!finished) {
        finished = true;
        callback({
          connected: true,
          status: data.status || 'online',
          version: data.version || '1.0.0',
          source: 'http',
        });
      }
    })
    .catch(() => {
      // 2. Fallback to Native Messaging Host check
      try {
        chrome.runtime.sendNativeMessage(NATIVE_HOST, { type: 'PING' }, (nativeRes: any) => {
          if (!finished) {
            finished = true;
            if (!chrome.runtime.lastError && nativeRes && !nativeRes.error) {
              callback({
                connected: true,
                status: nativeRes.status || 'connected',
                version: nativeRes.version || '1.0.0',
                source: 'native',
              });
            } else {
              callback({
                connected: false,
                error: 'Segmenta Desktop is Offline',
              });
            }
          }
        });
      } catch {
        if (!finished) {
          finished = true;
          callback({
            connected: false,
            error: 'Segmenta Desktop is Offline',
          });
        }
      }
    });

  // Safety timeout
  setTimeout(() => {
    if (!finished) {
      finished = true;
      callback({
        connected: false,
        error: 'Segmenta Desktop is Offline',
      });
    }
  }, 2500);
}

// Handle messages from content script or popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'SNIFFED_MEDIA') {
    const mediaUrl = message.url;
    if (!mediaUrl) return;

    const tabId = sender.tab?.id || message.tabId;
    const pageUrl = message.pageUrl || sender.tab?.url || '';

    // Check if it's an HLS, DASH, YouTube, or direct stream
    const isHls = mediaUrl.includes('.m3u8') || message.mediaType === 'hls';
    const isDash = mediaUrl.includes('.mpd') || message.mediaType === 'dash';
    const isYouTube = mediaUrl.includes('googlevideo.com') || message.mediaType === 'youtube' || pageUrl.includes('youtube.com');
    let mediaType: 'hls' | 'dash' | 'direct' | 'youtube' = 'direct';
    if (isHls) mediaType = 'hls';
    else if (isDash) mediaType = 'dash';
    else if (isYouTube) mediaType = 'youtube';

    if (tabId && tabId > 0) {
      recordDetectedStream(tabId, {
        id: `${tabId}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        url: mediaUrl,
        type: mediaType,
        title: message.title || 'Video Media',
        quality: message.quality || 'HD',
        resolution: message.quality || 'HD',
        tabId,
        detectedAt: Date.now(),
        pageUrl,
      });
    }

    const cookieLookupUrl = mediaUrl.startsWith('http') ? mediaUrl : (pageUrl.startsWith('http') ? pageUrl : 'http://localhost');
    chrome.cookies.getAll({ url: cookieLookupUrl }, (cookies) => {
      const cookieHeader = cookies ? cookies.map((c) => `${c.name}=${c.value}`).join('; ') : '';

      const payload: NativeMessage = {
        type: 'CREATE_TASK',
        payload: {
          url: mediaUrl,
          filename: message.filename || (message.title ? `${message.title.replace(/[\\/:*?"<>|]/g, '_')}.${message.format || 'mp4'}` : undefined),
          headers: {
            Cookie: cookieHeader,
            'User-Agent': navigator.userAgent,
            Referer: pageUrl || '',
          },
          segments: message.segments || 8,
          media_type: mediaType,
        },
      };

      saveRecentDownload({
        id: String(Date.now()),
        url: mediaUrl,
        filename: payload.payload?.filename || 'video.mp4',
        timestamp: Date.now(),
        mediaType: mediaType.toUpperCase(),
        status: 'Sent to Engine',
      });

      dispatchToNativeAndDesktop(payload, (res) => {
        sendResponse(res);
      });
    });

    return true; // Keep message channel open for async response
  }

  if (message.type === 'GET_TAB_STREAMS') {
    const tabId = message.tabId;
    if (typeof tabId === 'number') {
      const streams = tabStreamsMap.get(tabId) || [];
      sendResponse({ streams });
    } else {
      sendResponse({ streams: [] });
    }
    return false;
  }

  if (message.type === 'CLEAR_TAB_STREAMS') {
    const tabId = message.tabId;
    if (typeof tabId === 'number') {
      tabStreamsMap.set(tabId, []);
      chrome.storage.local.remove([`tab_streams_${tabId}`]);
      sendResponse({ ok: true });
    }
    return false;
  }

  if (message.type === 'TOGGLE_AUTO_INTERCEPT') {
    autoIntercept = !!message.enabled;
    chrome.storage.local.set({ auto_intercept: autoIntercept });
    sendResponse({ auto_intercept: autoIntercept });
    return false;
  }

  if (message.type === 'GET_AUTO_INTERCEPT') {
    sendResponse({ auto_intercept: autoIntercept });
    return false;
  }

  if (message.type === 'CHECK_STATUS') {
    checkConnectionStatus((status) => {
      sendResponse(status);
    });
    return true;
  }

  if (message.type === 'OPEN_DOWNLOADS_FOLDER') {
    // Dispatch to Native Host or desktop to open folder
    dispatchToNativeAndDesktop({
      type: 'OPEN_FOLDER',
    });
    sendResponse({ ok: true });
    return false;
  }
});

// Dispatch payload to Desktop HTTP endpoint with Native Messaging Host fallback
export function dispatchToNativeAndDesktop(
  payload: NativeMessage,
  callback?: (response: unknown) => void
) {
  if (payload.type === 'CREATE_TASK' && payload.payload) {
    // Send to Desktop HTTP endpoint first
    fetch(DESKTOP_HTTP_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload.payload),
    })
      .then((r) => r.json())
      .then((data) => {
        console.log('Task dispatched to Desktop via HTTP:', data);
        if (callback) callback(data);
      })
      .catch((httpErr) => {
        console.warn('Desktop HTTP endpoint not reachable, trying Native Messaging Host:', httpErr);
        // Fallback to Native Messaging Host
        try {
          chrome.runtime.sendNativeMessage(NATIVE_HOST, payload, (response) => {
            if (chrome.runtime.lastError) {
              console.warn('Native host error:', chrome.runtime.lastError.message);
              if (callback) callback({ error: 'Segmenta Desktop is not running or unreachable' });
            } else {
              if (callback) callback(response);
            }
          });
        } catch {
          if (callback) callback({ error: 'Segmenta Desktop is not running or unreachable' });
        }
      });
  } else {
    // For non-task messages (e.g. PING, OPEN_FOLDER, MEDIA_STREAM_DETECTED)
    try {
      chrome.runtime.sendNativeMessage(NATIVE_HOST, payload, (response) => {
        if (chrome.runtime.lastError) {
          if (callback) callback({ error: chrome.runtime.lastError.message });
        } else {
          if (callback) callback(response);
        }
      });
    } catch {
      if (callback) callback({ error: 'Native host not reachable' });
    }
  }
}
