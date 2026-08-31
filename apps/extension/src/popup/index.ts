interface HostStatusResponse {
  type?: string;
  status?: string;
  version?: string;
  error?: string;
  connected?: boolean;
}

interface RecentDownload {
  url: string;
  filename: string;
  timestamp: number;
}

document.addEventListener('DOMContentLoaded', () => {
  const statusBadge = document.getElementById('status-badge');
  const statusText = document.getElementById('status-text');
  const engineVersion = document.getElementById('engine-version');
  const btnDownloadTab = document.getElementById('btn-download-tab');
  const recentContainer = document.getElementById('recent-container');

  // Check connection status with background / native host
  chrome.runtime.sendMessage({ type: 'CHECK_STATUS' }, (response: HostStatusResponse) => {
    if (chrome.runtime.lastError || !response || response.error || response.connected === false) {
      if (statusBadge && statusText) {
        statusBadge.className = 'status-pill offline';
        statusText.innerText = 'Desktop Offline';
      }
      if (engineVersion) {
        engineVersion.innerText = 'Not Connected';
      }
    } else {
      if (statusBadge && statusText) {
        statusBadge.className = 'status-pill online';
        statusText.innerText = 'Connected';
      }
      if (engineVersion && response.version) {
        engineVersion.innerText = `v${response.version}`;
      }
    }
  });

  // Load recent downloads from storage
  if (chrome.storage && chrome.storage.local) {
    chrome.storage.local.get(['recent_downloads'], (res) => {
      const recent: RecentDownload[] = res.recent_downloads || [];
      if (recentContainer && recent.length > 0) {
        recentContainer.innerHTML = '';
        recent.slice(0, 4).forEach((item) => {
          const div = document.createElement('div');
          div.className = 'recent-item';
          div.innerHTML = `
            <span class="recent-title" title="${item.url}">${item.filename || item.url}</span>
            <span style="color: #06b6d4; font-weight: 600;">Captured</span>
          `;
          recentContainer.appendChild(div);
        });
      }
    });
  }

  // Handle active tab grab button
  if (btnDownloadTab) {
    btnDownloadTab.addEventListener('click', async () => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab && tab.id) {
        chrome.scripting?.executeScript(
          {
            target: { tabId: tab.id },
            func: () => {
              const videos = document.querySelectorAll('video');
              if (videos.length === 0) {
                alert('No HTML5 video elements found on this page.');
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
                });
              } else {
                alert('Video source is not ready yet.');
              }
            },
          },
          () => {
            btnDownloadTab.innerText = 'Triggered!';
            setTimeout(() => {
              btnDownloadTab.innerText = 'Grab Active Tab Video / Audio';
            }, 1200);
          }
        );
      }
    });
  }
});
