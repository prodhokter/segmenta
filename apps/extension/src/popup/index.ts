interface HostStatusResponse {
  type?: string;
  status?: string;
  version?: string;
  error?: string;
  connected?: boolean;
}

interface StreamItem {
  id: string;
  url: string;
  type: 'hls' | 'dash' | 'direct' | 'chunk';
  mimeType?: string;
  title: string;
  tabId?: number;
  detectedAt: number;
  pageUrl?: string;
}

interface RecentDownload {
  url: string;
  filename: string;
  timestamp: number;
}

document.addEventListener('DOMContentLoaded', async () => {
  const statusBadge = document.getElementById('status-badge');
  const statusText = document.getElementById('status-text');
  const toggleAutoIntercept = document.getElementById('toggle-auto-intercept') as HTMLInputElement | null;
  const btnDownloadTab = document.getElementById('btn-download-tab');
  const streamContainer = document.getElementById('stream-container');
  const streamCount = document.getElementById('stream-count');
  const recentContainer = document.getElementById('recent-container');

  // 1. Check connection status with background / native host
  chrome.runtime.sendMessage({ type: 'CHECK_STATUS' }, (response: HostStatusResponse) => {
    if (chrome.runtime.lastError || !response || response.error || response.connected === false) {
      if (statusBadge && statusText) {
        statusBadge.className = 'status-pill offline';
        statusText.innerText = 'Desktop Offline';
      }
    } else {
      if (statusBadge && statusText) {
        statusBadge.className = 'status-pill online';
        statusText.innerText = response.version ? `Desktop v${response.version}` : 'Connected';
      }
    }
  });

  // 2. Initialize and bind Auto-Interception Toggle
  if (toggleAutoIntercept) {
    chrome.runtime.sendMessage({ type: 'GET_AUTO_INTERCEPT' }, (res) => {
      if (res && typeof res.auto_intercept === 'boolean') {
        toggleAutoIntercept.checked = res.auto_intercept;
      }
    });

    toggleAutoIntercept.addEventListener('change', () => {
      chrome.runtime.sendMessage({
        type: 'TOGGLE_AUTO_INTERCEPT',
        enabled: toggleAutoIntercept.checked,
      });
    });
  }

  // 3. Load detected streams for the current active tab
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const activeTabId = activeTab?.id;

  function renderStreams(streams: StreamItem[]) {
    if (!streamContainer || !streamCount) return;

    streamCount.innerText = String(streams.length);

    if (streams.length === 0) {
      streamContainer.innerHTML = '<div class="empty-state">No media streams sniffed on this tab.</div>';
      return;
    }

    streamContainer.innerHTML = '';
    streams.forEach((stream) => {
      const item = document.createElement('div');
      item.className = 'stream-item';

      const tagClass = stream.type || 'direct';
      const shortUrl = stream.url.length > 35 ? `${stream.url.substring(0, 35)}...` : stream.url;

      item.innerHTML = `
        <div class="stream-info">
          <span class="stream-title" title="${stream.url}">${stream.title || shortUrl}</span>
          <div class="stream-meta">
            <span class="stream-tag ${tagClass}">${stream.type}</span>
            <span>${new URL(stream.url).pathname.split('/').pop()?.substring(0, 20) || 'media'}</span>
          </div>
        </div>
      `;

      const downloadBtn = document.createElement('button');
      downloadBtn.className = 'btn-download-stream';
      downloadBtn.innerText = 'Download';
      downloadBtn.onclick = () => {
        downloadBtn.innerText = 'Queuing...';
        chrome.runtime.sendMessage(
          {
            type: 'SNIFFED_MEDIA',
            url: stream.url,
            title: stream.title || activeTab?.title || 'Stream Video',
            pageUrl: activeTab?.url || window.location.href,
            mediaType: stream.type === 'hls' ? 'hls' : 'direct',
          },
          () => {
            downloadBtn.innerText = 'Queued ✓';
            setTimeout(() => {
              downloadBtn.innerText = 'Download';
            }, 2000);
          }
        );
      };

      item.appendChild(downloadBtn);
      streamContainer.appendChild(item);
    });
  }

  if (activeTabId) {
    chrome.runtime.sendMessage({ type: 'GET_TAB_STREAMS', tabId: activeTabId }, (res) => {
      if (res && Array.isArray(res.streams)) {
        renderStreams(res.streams);
      }
    });

    // Listen for live stream detected updates while popup is open
    chrome.runtime.onMessage.addListener((msg) => {
      if (msg.type === 'STREAM_DETECTED' && msg.tabId === activeTabId) {
        chrome.runtime.sendMessage({ type: 'GET_TAB_STREAMS', tabId: activeTabId }, (res) => {
          if (res && Array.isArray(res.streams)) {
            renderStreams(res.streams);
          }
        });
      }
    });
  }

  // 4. Load recent downloads from storage
  if (chrome.storage && chrome.storage.local) {
    chrome.storage.local.get(['recent_downloads'], (res) => {
      const recent: RecentDownload[] = res.recent_downloads || [];
      if (recentContainer) {
        if (recent.length > 0) {
          recentContainer.innerHTML = '';
          recent.slice(0, 4).forEach((item) => {
            const div = document.createElement('div');
            div.className = 'stream-item';
            div.innerHTML = `
              <div class="stream-info">
                <span class="stream-title" title="${item.url}">${item.filename || item.url}</span>
                <div class="stream-meta">
                  <span class="stream-tag direct">Dispatched</span>
                  <span>${new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
              </div>
            `;
            recentContainer.appendChild(div);
          });
        }
      }
    });
  }

  // 5. Handle active tab grab button
  if (btnDownloadTab && activeTabId) {
    btnDownloadTab.addEventListener('click', async () => {
      chrome.scripting?.executeScript(
        {
          target: { tabId: activeTabId },
          func: () => {
            const videos = document.querySelectorAll('video');
            if (videos.length === 0) {
              alert('Segmenta: No HTML5 video elements found on this page.');
              return;
            }
            const firstVideo = videos[0] as HTMLVideoElement;
            const src = firstVideo.currentSrc || firstVideo.src;
            if (src) {
              chrome.runtime.sendMessage({
                type: 'SNIFFED_MEDIA',
                url: src,
                title: document.title,
                pageUrl: window.location.href,
                mediaType: src.includes('.m3u8') ? 'hls' : 'direct',
              });
            } else {
              alert('Segmenta: Video source is not ready yet. Please click play on the video.');
            }
          },
        },
        () => {
          btnDownloadTab.innerText = 'Triggered!';
          setTimeout(() => {
            btnDownloadTab.innerHTML = `
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
              </svg>
              Grab Video / Audio on Page
            `;
          }, 1500);
        }
      );
    });
  }
});
