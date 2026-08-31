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

// Extract filename from Content-Disposition header
function getFilenameFromContentDisposition(headers?: chrome.webRequest.HttpHeader[]): string | undefined {
  if (!headers) return undefined;
  const cdHeader = headers.find((h) => h.name.toLowerCase() === 'content-disposition');
  if (!cdHeader || !cdHeader.value) return undefined;

  // e.g. attachment; filename="file.zip" or filename*=UTF-8''file.zip
  const value = cdHeader.value;
  const matchStar = /filename\*=UTF-8''([^;]+)/i.exec(value);
  if (matchStar && matchStar[1]) {
    try {
      return decodeURIComponent(matchStar[1].trim());
    } catch {
      return matchStar[1].trim();
    }
  }

  const matchQuoted = /filename="([^"]+)"/i.exec(value);
  if (matchQuoted && matchQuoted[1]) {
    return matchQuoted[1].trim();
  }

  const matchUnquoted = /filename=([^;]+)/i.exec(value);
  if (matchUnquoted && matchUnquoted[1]) {
    return matchUnquoted[1].trim().replace(/^["']|["']$/g, '');
  }

  return undefined;
}

// Helper to extract file extension from URL or filename
function getFileExtension(url: string, filename?: string): string {
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

// Determine if a URL / MIME / header matches interceptable download criteria
function shouldInterceptDownload(url: string, mime?: string, headers?: chrome.webRequest.HttpHeader[], filename?: string): boolean {
  if (!url || !url.startsWith('http')) return false;

  // Ignore internal localhost ports to avoid looping requests
  try {
    const u = new URL(url);
    if (u.hostname === '127.0.0.1' || u.hostname === 'localhost') {
      return false;
    }
  } catch {
    return false;
  }

  const ext = getFileExtension(url, filename);
  if (ext && INTERCEPT_EXTENSIONS.has(ext)) {
    return true;
  }

  // Check Content-Disposition attachment header
  if (headers) {
    const cdHeader = headers.find((h) => h.name.toLowerCase() === 'content-disposition');
    if (cdHeader && cdHeader.value && cdHeader.value.toLowerCase().includes('attachment')) {
      return true;
    }
  }

  // Check MIME Types
  if (mime) {
    const m = mime.toLowerCase();
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

  // Deduplicate rapid identical dispatches (within 2 seconds)
  if (inFlightDispatches.has(downloadUrl)) return;
  inFlightDispatches.add(downloadUrl);
  setTimeout(() => inFlightDispatches.delete(downloadUrl), 2500);

  let finalFilename = preferredFilename;
  if (!finalFilename) {
    try {
      const parsedPath = new URL(downloadUrl).pathname;
      const lastSeg = parsedPath.split('/').pop();
      if (lastSeg && lastSeg.includes('.')) {
        finalFilename = decodeURIComponent(lastSeg.split('?')[0].split('#')[0]);
      }
    } catch {
      // ignore
    }
  }
  if (!finalFilename) {
    const ext = getFileExtension(downloadUrl);
    finalFilename = ext ? `download.${ext}` : 'download.bin';
  }

  // Extract cookies for authentication and context preservation
  chrome.cookies.getAll({ url: downloadUrl }, (cookies) => {
    const cookieHeader = cookies ? cookies.map((c) => `${c.name}=${c.value}`).join('; ') : '';

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

    // Notify user
    showSegmentaNotification(
      'Download Intercepted',
      `Segmenta has taken over: "${finalFilename}" with 8-segment acceleration.`
    );

    // Dispatch to Native Messaging Host and Desktop HTTP daemon
    dispatchToNativeAndDesktop(payload, callback);
  });
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
      let contentType = '';
      const ctHeader = details.responseHeaders.find((h) => h.name.toLowerCase() === 'content-type');
      if (ctHeader && ctHeader.value) contentType = ctHeader.value;

      if (shouldInterceptDownload(details.url, contentType, details.responseHeaders, cdFilename)) {
        // We will catch and cancel this via chrome.downloads.onCreated, but pre-record context here
        const ext = getFileExtension(details.url, cdFilename);
        if (ext && INTERCEPT_EXTENSIONS.has(ext)) {
          // Keep note of resolved filename if available
        }
      }
    }
  },
  { urls: ['<all_urls>'] },
  ['responseHeaders']
);

// =========================================================================
// 2. Universal Download Interception: chrome.downloads.onCreated
// =========================================================================
chrome.downloads.onCreated.addListener(async (downloadItem) => {
  if (!autoIntercept) return;
  if (!downloadItem.url || !downloadItem.url.startsWith('http')) return;

  const rawFilename = downloadItem.filename ? downloadItem.filename.split(/[\\/]/).pop() : undefined;
  const ext = getFileExtension(downloadItem.url, rawFilename);

  // Full IDM parity check: match known interceptable extensions or mime types
  const shouldIntercept =
    (ext && INTERCEPT_EXTENSIONS.has(ext)) ||
    (downloadItem.mime && (
      downloadItem.mime.startsWith('video/') ||
      downloadItem.mime.startsWith('audio/') ||
      downloadItem.mime.startsWith('application/x-') ||
      downloadItem.mime.startsWith('application/octet-stream') ||
      downloadItem.mime.includes('zip') ||
      downloadItem.mime.includes('rar') ||
      downloadItem.mime.includes('7z') ||
      downloadItem.mime.includes('tar') ||
      downloadItem.mime.includes('gzip') ||
      downloadItem.mime.includes('compressed') ||
      downloadItem.mime.includes('pdf') ||
      downloadItem.mime.includes('msword') ||
      downloadItem.mime.includes('officedocument') ||
      downloadItem.mime.includes('vnd.openxmlformats') ||
      downloadItem.mime.includes('executable') ||
      downloadItem.mime.includes('iso')
    ));

  if (!shouldIntercept) {
    return;
  }

  // Instantly cancel and erase browser download to prevent browser Save-As dialog holding the file
  try {
    chrome.downloads.cancel(downloadItem.id, () => {
      if (chrome.runtime.lastError) {
        console.warn('Could not cancel browser download:', chrome.runtime.lastError.message);
      }
      chrome.downloads.erase({ id: downloadItem.id }, () => {
        if (chrome.runtime.lastError) {
          // Ignore erase error if already removed
        }
      });
    });
  } catch (e) {
    console.warn('Error canceling browser download:', e);
  }

  // Resolve target filename
  let finalFilename = rawFilename;
  if (!finalFilename) {
    try {
      const parsedPath = new URL(downloadItem.url).pathname;
      const lastSeg = parsedPath.split('/').pop();
      if (lastSeg && lastSeg.includes('.')) {
        finalFilename = decodeURIComponent(lastSeg.split('?')[0].split('#')[0]);
      }
    } catch {
      // ignore url parse error
    }
  }
  if (!finalFilename) {
    finalFilename = ext ? `download.${ext}` : 'download.bin';
  }

  // Extract cookies and context, then dispatch
  interceptAndDispatchUrl(downloadItem.url, downloadItem.referrer, finalFilename);
});

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
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

  // 1. Try Native Messaging Host first
  try {
    chrome.runtime.sendNativeMessage(NATIVE_HOST, { type: 'PING' }, (nativeRes: any) => {
      if (!chrome.runtime.lastError && nativeRes && !nativeRes.error) {
        if (!finished) {
          finished = true;
          callback({
            connected: true,
            status: nativeRes.status || 'connected',
            version: nativeRes.version || '1.0.0',
            source: 'native',
          });
          return;
        }
      }

      // If native messaging failed, try HTTP endpoint 127.0.0.1:45678/ping
      checkHttpPing();
    });
  } catch {
    checkHttpPing();
  }

  // 2. HTTP /ping endpoint check helper
  function checkHttpPing() {
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
      .catch((err) => {
        if (!finished) {
          finished = true;
          callback({
            connected: false,
            error: 'Desktop Offline',
          });
        }
      });
  }

  // Safety timeout in case both hang
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

// Dispatch payload to Native Messaging Host with HTTP 127.0.0.1:45678 fallback
export function dispatchToNativeAndDesktop(
  payload: NativeMessage,
  callback?: (response: unknown) => void
) {
  let responded = false;

  // Try Native Messaging Host first
  try {
    chrome.runtime.sendNativeMessage(NATIVE_HOST, payload, (response) => {
      if (chrome.runtime.lastError) {
        console.warn('Native host not reachable:', chrome.runtime.lastError.message);
        // Fallback to local HTTP server if desktop app has active HTTP listener
        sendToDesktopHttp(payload, (httpRes) => {
          if (!responded && callback) {
            responded = true;
            callback(httpRes);
          }
        });
      } else {
        console.log('Task dispatched via Native Messaging Host:', response);
        if (!responded && callback) {
          responded = true;
          callback(response);
        }
      }
    });
  } catch (err) {
    console.error('Failed to dispatch native message:', err);
    sendToDesktopHttp(payload, (httpRes) => {
      if (!responded && callback) {
        responded = true;
        callback(httpRes);
      }
    });
  }
}

function sendToDesktopHttp(payload: NativeMessage, callback: (response: unknown) => void) {
  if (payload.type !== 'CREATE_TASK' || !payload.payload) {
    callback({ error: 'Native host not reachable and not a task creation payload' });
    return;
  }

  fetch(DESKTOP_HTTP_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload.payload),
  })
    .then((r) => r.json())
    .then((data) => {
      console.log('Task dispatched to Desktop via HTTP:', data);
      callback(data);
    })
    .catch((err) => {
      console.warn('Desktop HTTP endpoint not reachable:', err);
      callback({ error: 'Segmenta Desktop is not running or unreachable' });
    });
}
