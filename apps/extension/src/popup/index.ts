interface HostStatusResponse {
  type?: string;
  status?: string;
  version?: string;
  error?: string;
  connected?: boolean;
  source?: 'native' | 'http';
}

interface StreamItem {
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
}

interface RecentDownload {
  id?: string;
  url: string;
  filename: string;
  fileSize?: string;
  timestamp: number;
  mediaType?: string;
  status?: string;
}

document.addEventListener('DOMContentLoaded', async () => {
  const statusBadge = document.getElementById('status-badge');
  const statusText = document.getElementById('status-text');
  const toggleAutoIntercept = document.getElementById('toggle-auto-intercept') as HTMLInputElement | null;
  const btnDownloadTab = document.getElementById('btn-download-tab');
  const btnClearStreams = document.getElementById('btn-clear-streams');
  const btnOpenFolder = document.getElementById('btn-open-folder');
  const linkOpenDashboard = document.getElementById('link-open-dashboard');
  const streamContainer = document.getElementById('stream-container');
  const streamCount = document.getElementById('stream-count');
  const recentContainer = document.getElementById('recent-container');

  // 1. Live Connection Status with Native Host & 127.0.0.1:45678 /ping
  function updateStatus(isOnline: boolean, version?: string) {
    if (!statusBadge || !statusText) return;
    if (isOnline) {
      statusBadge.className = 'status-pill online';
      statusText.innerText = version ? `Connected (v${version})` : 'Connected';
    } else {
      statusBadge.className = 'status-pill offline';
      statusText.innerText = 'Desktop Offline';
    }
  }

  function checkStatus() {
    chrome.runtime.sendMessage({ type: 'CHECK_STATUS' }, (response: HostStatusResponse) => {
      if (chrome.runtime.lastError || !response || response.error || response.connected === false) {
        // Direct secondary check to HTTP /ping from popup just in case
        fetch('http://127.0.0.1:45678/ping')
          .then((r) => r.json())
          .then((data: any) => {
            updateStatus(true, data.version);
          })
          .catch(() => {
            updateStatus(false);
          });
      } else {
        updateStatus(true, response.version);
      }
    });
  }

  checkStatus();
  // Poll status periodically while popup is visible
  const statusInterval = setInterval(checkStatus, 3000);
  window.addEventListener('unload', () => clearInterval(statusInterval));

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

  // 3. Load detected streams for current active tab
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const activeTabId = activeTab?.id;

  function renderStreams(streams: StreamItem[]) {
    if (!streamContainer || !streamCount) return;

    streamCount.innerText = String(streams.length);
    if (btnClearStreams) {
      btnClearStreams.style.display = streams.length > 0 ? 'block' : 'none';
    }

    if (streams.length === 0) {
      streamContainer.innerHTML = '<div class="empty-state">No media streams sniffed on current tab.</div>';
      return;
    }

    streamContainer.innerHTML = '';
    streams.forEach((stream) => {
      const item = document.createElement('div');
      item.className = 'stream-item';

      const tagClass = stream.type || 'direct';
      const shortUrl = stream.url.length > 40 ? `${stream.url.substring(0, 37)}...` : stream.url;
      const displayTitle = stream.title || shortUrl;
      const qualityBadge = stream.quality || stream.resolution || 'HD';

      // SVG Icon based on type
      let iconSvg = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polygon points="23 7 16 12 23 17 23 7"></polygon>
          <rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect>
        </svg>
      `;

      if (stream.type === 'youtube') {
        iconSvg = `
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M22.54 6.42a2.78 2.78 0 0 0-1.94-2C18.88 4 12 4 12 4s-6.88 0-8.6.46a2.78 2.78 0 0 0-1.94 2A29 29 0 0 0 1 11.75a29 29 0 0 0 .46 5.33A2.78 2.78 0 0 0 3.4 19c1.72.46 8.6.46 8.6.46s6.88 0 8.6-.46a2.78 2.78 0 0 0 1.94-2 29 29 0 0 0 .46-5.25 29 29 0 0 0-.46-5.33z"></path>
            <polygon points="9.75 15.02 15.5 11.75 9.75 8.48 9.75 15.02"></polygon>
          </svg>
        `;
      }

      item.innerHTML = `
        <div class="stream-icon">
          ${iconSvg}
        </div>
        <div class="stream-info">
          <span class="stream-title" title="${stream.url}">${displayTitle}</span>
          <div class="stream-meta">
            <span class="stream-tag ${tagClass}">${stream.type}</span>
            <span class="stream-tag res-badge">${qualityBadge}</span>
            <span>${new Date(stream.detectedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
          </div>
        </div>
      `;

      const downloadBtn = document.createElement('button');
      downloadBtn.className = 'btn-download-stream';
      downloadBtn.innerHTML = `
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
          <polyline points="7 10 12 15 17 10"></polyline>
          <line x1="12" y1="15" x2="12" y2="3"></line>
        </svg>
        <span>Download</span>
      `;

      downloadBtn.onclick = () => {
        downloadBtn.innerHTML = `
          <svg class="animate-spin" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2.5">
            <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-opacity="0.25"></circle>
            <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor"></path>
          </svg>
          <span>Queuing...</span>
        `;

        chrome.runtime.sendMessage(
          {
            type: 'SNIFFED_MEDIA',
            url: stream.url,
            title: stream.title || activeTab?.title || 'Segmenta Stream',
            pageUrl: activeTab?.url || window.location.href,
            mediaType: stream.type,
            quality: stream.quality,
          },
          () => {
            downloadBtn.innerHTML = `<span>Queued ✓</span>`;
            downloadBtn.style.background = '#059669';
            setTimeout(() => {
              downloadBtn.innerHTML = `
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                  <polyline points="7 10 12 15 17 10"></polyline>
                  <line x1="12" y1="15" x2="12" y2="3"></line>
                </svg>
                <span>Download</span>
              `;
              downloadBtn.style.background = 'var(--brand-primary)';
            }, 2500);

            // Reload recent downloads
            loadRecentDownloads();
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

    // Listen for live stream detected updates
    chrome.runtime.onMessage.addListener((msg) => {
      if (msg.type === 'STREAM_DETECTED' && msg.tabId === activeTabId) {
        chrome.runtime.sendMessage({ type: 'GET_TAB_STREAMS', tabId: activeTabId }, (res) => {
          if (res && Array.isArray(res.streams)) {
            renderStreams(res.streams);
          }
        });
      }
    });

    // Clear streams button
    if (btnClearStreams) {
      btnClearStreams.addEventListener('click', () => {
        chrome.runtime.sendMessage({ type: 'CLEAR_TAB_STREAMS', tabId: activeTabId }, () => {
          renderStreams([]);
        });
      });
    }
  }

  // 4. Load recent downloads from storage
  function loadRecentDownloads() {
    if (chrome.storage && chrome.storage.local) {
      chrome.storage.local.get(['recent_downloads'], (res) => {
        const recent: RecentDownload[] = res.recent_downloads || [];
        if (recentContainer) {
          if (recent.length > 0) {
            recentContainer.innerHTML = '';
            recent.slice(0, 5).forEach((item) => {
              const div = document.createElement('div');
              div.className = 'stream-item';
              div.innerHTML = `
                <div class="stream-icon" style="background: rgba(16, 185, 129, 0.15); color: #34d399;">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                    <polyline points="7 10 12 15 17 10"></polyline>
                    <line x1="12" y1="15" x2="12" y2="3"></line>
                  </svg>
                </div>
                <div class="stream-info">
                  <span class="stream-title" title="${item.url}">${item.filename || item.url}</span>
                  <div class="stream-meta">
                    <span class="stream-tag direct">${item.status || 'Segmented'}</span>
                    ${item.fileSize ? `<span>${item.fileSize}</span> • ` : ''}
                    <span>${new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                </div>
              `;
              recentContainer.appendChild(div);
            });
          } else {
            recentContainer.innerHTML = '<div class="empty-state">No recent downloads intercepted yet.</div>';
          }
        }
      });
    }
  }

  loadRecentDownloads();

  // 5. Open Download Folder action
  if (btnOpenFolder) {
    btnOpenFolder.addEventListener('click', () => {
      chrome.runtime.sendMessage({ type: 'OPEN_DOWNLOADS_FOLDER' });
    });
  }

  // 6. Open Desktop Dashboard link
  if (linkOpenDashboard) {
    linkOpenDashboard.addEventListener('click', (e) => {
      e.preventDefault();
      fetch('http://127.0.0.1:45678/ping')
        .then(() => {
          chrome.tabs.create({ url: 'http://127.0.0.1:45678' });
        })
        .catch(() => {
          alert('Segmenta Desktop app is not running. Please launch Segmenta.');
        });
    });
  }

  // 7. Handle active tab grab button
  if (btnDownloadTab && activeTabId) {
    btnDownloadTab.addEventListener('click', async () => {
      btnDownloadTab.innerHTML = `
        <svg class="animate-spin" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2.5">
          <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-opacity="0.25"></circle>
          <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor"></path>
        </svg>
        <span>Sniffing Current Page...</span>
      `;

      chrome.scripting?.executeScript(
        {
          target: { tabId: activeTabId },
          func: () => {
            const videos = Array.from(document.querySelectorAll('video')) as HTMLVideoElement[];
            const audios = Array.from(document.querySelectorAll('audio')) as HTMLAudioElement[];

            if (videos.length === 0 && audios.length === 0) {
              const isYT = window.location.hostname.includes('youtube.com');
              if (isYT) {
                chrome.runtime.sendMessage({
                  type: 'SNIFFED_MEDIA',
                  url: window.location.href,
                  title: document.title,
                  pageUrl: window.location.href,
                  mediaType: 'youtube',
                });
                return { found: true, count: 1, title: document.title };
              }
              return { found: false, count: 0 };
            }

            let foundCount = 0;
            videos.forEach((v) => {
              const src = v.currentSrc || v.src || v.getAttribute('data-src');
              if (src) {
                foundCount++;
                chrome.runtime.sendMessage({
                  type: 'SNIFFED_MEDIA',
                  url: src,
                  title: document.title,
                  pageUrl: window.location.href,
                  mediaType: src.includes('.m3u8') ? 'hls' : (src.includes('.mpd') ? 'dash' : 'direct'),
                });
              }
            });

            return { found: foundCount > 0, count: foundCount, title: document.title };
          },
        },
        (results) => {
          const res = results && results[0]?.result;
          if (res && res.found) {
            btnDownloadTab.innerHTML = `<span>Dispatched ${res.count} Media Streams ✓</span>`;
            btnDownloadTab.style.background = '#059669';
          } else {
            btnDownloadTab.innerHTML = `<span>No Active Video Found</span>`;
            btnDownloadTab.style.background = '#d97706';
          }

          setTimeout(() => {
            btnDownloadTab.innerHTML = `
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
              </svg>
              <span>Sniff & Grab Media on Page</span>
            `;
            btnDownloadTab.style.background = 'linear-gradient(135deg, var(--brand-primary), #6366f1)';
          }, 2000);
        }
      );
    });
  }
});
