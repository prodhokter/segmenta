const NATIVE_HOST = 'com.segmenta.downloader';
const DESKTOP_HTTP_ENDPOINT = 'http://127.0.0.1:45678/api/tasks';

export interface StreamItem {
  id: string;
  url: string;
  type: 'hls' | 'dash' | 'direct' | 'chunk' | 'youtube';
  mimeType?: string;
  title: string;
  tabId?: number;
  detectedAt: number;
  pageUrl?: string;
  variants?: Array<{
    resolution?: string;
    bandwidth?: number;
    url: string;
  }>;
}

export interface TaskPayload {
  url: string;
  filename?: string;
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

// In-memory tab streams cache (tabId -> StreamItem[])
const tabStreamsMap = new Map<number, StreamItem[]>();

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

// Helper to record stream item for tab
function recordDetectedStream(tabId: number, stream: StreamItem) {
  const list = tabStreamsMap.get(tabId) || [];
  if (!list.some((s) => s.url === stream.url)) {
    list.unshift(stream);
    // Keep max 20 streams per tab
    if (list.length > 20) list.pop();
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

    // Notify native host about stream detection if master/playlist
    if (stream.type === 'hls' || stream.type === 'dash' || stream.type === 'direct') {
      dispatchToNativeAndDesktop({
        type: 'MEDIA_STREAM_DETECTED',
        stream,
      });
    }
  }
}

// Helper to check if URL is an HLS or video chunk
function isStreamOrChunkUrl(url: string, responseHeaders?: chrome.webRequest.HttpHeader[]): { isMatch: boolean; type: 'hls' | 'dash' | 'chunk' | 'direct'; mime?: string } {
  const lowerUrl = url.toLowerCase();

  // Header inspection
  let contentType = '';
  if (responseHeaders) {
    const ctHeader = responseHeaders.find(h => h.name.toLowerCase() === 'content-type');
    if (ctHeader && ctHeader.value) {
      contentType = ctHeader.value.toLowerCase();
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
    lowerUrl.includes('.m4v') ||
    contentType.includes('video/mp2t') ||
    contentType.includes('video/iso.segment')
  ) {
    return { isMatch: true, type: 'chunk', mime: contentType || 'video/mp2t' };
  }

  if (
    lowerUrl.includes('.mp4') ||
    lowerUrl.includes('.webm') ||
    lowerUrl.includes('.mkv') ||
    lowerUrl.includes('.mp3') ||
    lowerUrl.includes('.flac') ||
    contentType.includes('video/mp4') ||
    contentType.includes('video/webm') ||
    contentType.includes('audio/mpeg')
  ) {
    return { isMatch: true, type: 'direct', mime: contentType || 'video/mp4' };
  }

  return { isMatch: false, type: 'direct' };
}

// WebRequest sniffer for HLS streams (.m3u8, mime types) and video chunks (.ts, .m4s)
chrome.webRequest.onHeadersReceived.addListener(
  (details) => {
    if (!details.url || !details.url.startsWith('http')) return;
    const tabId = details.tabId;
    if (tabId < 0) return;

    const streamCheck = isStreamOrChunkUrl(details.url, details.responseHeaders);
    if (streamCheck.isMatch) {
      const filename = details.url.split('?')[0].split('/').pop() || 'media_stream';
      const stream: StreamItem = {
        id: `${tabId}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        url: details.url,
        type: streamCheck.type,
        mimeType: streamCheck.mime,
        title: filename,
        tabId,
        detectedAt: Date.now(),
        pageUrl: details.initiator || '',
      };

      recordDetectedStream(tabId, stream);
    }
  },
  { urls: ['<all_urls>'] },
  ['responseHeaders']
);

// Intercept browser downloads
chrome.downloads.onCreated.addListener((downloadItem) => {
  if (!autoIntercept) return;
  if (!downloadItem.url || !downloadItem.url.startsWith('http')) return;

  chrome.cookies.getAll({ url: downloadItem.url }, (cookies) => {
    const cookieHeader = cookies ? cookies.map((c) => `${c.name}=${c.value}`).join('; ') : '';

    const payload: NativeMessage = {
      type: 'CREATE_TASK',
      payload: {
        url: downloadItem.url,
        filename: downloadItem.filename || undefined,
        headers: {
          Cookie: cookieHeader,
          'User-Agent': navigator.userAgent,
          Referer: downloadItem.referrer || '',
        },
        segments: 8,
      },
    };

    // Save to recent downloads
    saveRecentDownload({
      url: downloadItem.url,
      filename: downloadItem.filename || downloadItem.url.split('/').pop() || 'download',
      timestamp: Date.now(),
    });

    dispatchToNativeAndDesktop(payload);
  });
});

function saveRecentDownload(item: { url: string; filename: string; timestamp: number }) {
  chrome.storage.local.get(['recent_downloads'], (res) => {
    const recent = res.recent_downloads || [];
    recent.unshift(item);
    if (recent.length > 20) recent.pop();
    chrome.storage.local.set({ recent_downloads: recent });
  });
}

// Handle messages from content script or popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'SNIFFED_MEDIA') {
    const mediaUrl = message.url;
    if (!mediaUrl) return;

    const tabId = sender.tab?.id || message.tabId;
    const pageUrl = message.pageUrl || sender.tab?.url || '';

    // Check if it's an HLS or direct stream
    const isHls = mediaUrl.includes('.m3u8') || message.mediaType === 'hls';
    const mediaType = isHls ? 'hls' : (message.mediaType || 'direct');

    if (tabId && tabId > 0) {
      recordDetectedStream(tabId, {
        id: `${tabId}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        url: mediaUrl,
        type: mediaType,
        title: message.title || 'Video Media',
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
        url: mediaUrl,
        filename: payload.payload?.filename || 'video.mp4',
        timestamp: Date.now(),
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
    const payload: NativeMessage = {
      type: 'PING',
    };
    dispatchToNativeAndDesktop(payload, (res) => {
      sendResponse(res);
    });
    return true;
  }
});

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
