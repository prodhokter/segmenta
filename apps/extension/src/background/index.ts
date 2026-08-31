const NATIVE_HOST = 'com.segmenta.downloader';

export interface TaskPayload {
  url: string;
  filename?: string;
  headers: Record<string, string>;
  segments: number;
}

export interface NativeMessage {
  type: string;
  payload?: TaskPayload;
  task_id?: string;
}

// Intercept browser downloads
chrome.downloads.onCreated.addListener((downloadItem) => {
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

    dispatchToNativeHost(payload);
  });
});

// Handle messages from content script or popup
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'SNIFFED_MEDIA') {
    const mediaUrl = message.url;
    if (!mediaUrl) return;

    chrome.cookies.getAll({ url: mediaUrl }, (cookies) => {
      const cookieHeader = cookies ? cookies.map((c) => `${c.name}=${c.value}`).join('; ') : '';

      const payload: NativeMessage = {
        type: 'CREATE_TASK',
        payload: {
          url: mediaUrl,
          filename: message.filename || (message.title ? `${message.title.replace(/[\\/:*?"<>|]/g, '_')}.mp4` : undefined),
          headers: {
            Cookie: cookieHeader,
            'User-Agent': navigator.userAgent,
            Referer: message.pageUrl || '',
          },
          segments: message.segments || 8,
        },
      };

      dispatchToNativeHost(payload, (res) => {
        sendResponse(res);
      });
    });

    return true; // Keep message channel open for async response
  }

  if (message.type === 'CHECK_STATUS') {
    const payload: NativeMessage = {
      type: 'PING',
    };
    dispatchToNativeHost(payload, (res) => {
      sendResponse(res);
    });
    return true;
  }
});

export function dispatchToNativeHost(
  payload: NativeMessage,
  callback?: (response: unknown) => void
) {
  try {
    chrome.runtime.sendNativeMessage(NATIVE_HOST, payload, (response) => {
      if (chrome.runtime.lastError) {
        console.warn('Native host not reachable:', chrome.runtime.lastError.message);
        if (callback) callback({ error: chrome.runtime.lastError.message, connected: false });
      } else {
        console.log('Task dispatched to Segmenta:', response);
        if (callback) callback(response);
      }
    });
  } catch (err) {
    console.error('Failed to dispatch native message:', err);
    if (callback) callback({ error: String(err), connected: false });
  }
}
