interface SniffedMedia {
  url: string;
  type: 'hls' | 'dash' | 'direct' | 'blob' | 'youtube';
  title: string;
  quality?: string;
}

// Show a modern, dark-themed toast notification for user feedback
function showToast(message: string, isSuccess = true) {
  const toastId = 'segmenta-toast-container';
  let toast = document.getElementById(toastId);
  if (!toast) {
    toast = document.createElement('div');
    toast.id = toastId;
    toast.style.position = 'fixed';
    toast.style.bottom = '24px';
    toast.style.right = '24px';
    toast.style.zIndex = '2147483647';
    toast.style.display = 'flex';
    toast.style.alignItems = 'center';
    toast.style.gap = '10px';
    toast.style.padding = '10px 16px';
    toast.style.borderRadius = '10px';
    toast.style.fontFamily = 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    toast.style.fontSize = '13px';
    toast.style.fontWeight = '500';
    toast.style.color = '#ffffff';
    toast.style.boxShadow = '0 10px 30px rgba(0, 0, 0, 0.4), 0 2px 8px rgba(99, 102, 241, 0.3)';
    toast.style.backdropFilter = 'blur(16px)';
    toast.style.transition = 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)';
    toast.style.transform = 'translateY(20px)';
    toast.style.opacity = '0';
    toast.style.pointerEvents = 'none';
    document.body.appendChild(toast);
  }

  const iconSvg = isSuccess
    ? `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
         <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
         <polyline points="22 4 12 14.01 9 11.01"></polyline>
       </svg>`
    : `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
         <circle cx="12" cy="12" r="10"></circle>
         <line x1="12" y1="8" x2="12" y2="12"></line>
         <line x1="12" y1="16" x2="12.01" y2="16"></line>
       </svg>`;

  toast.style.background = isSuccess
    ? 'linear-gradient(135deg, rgba(15, 23, 42, 0.95), rgba(30, 41, 59, 0.95))'
    : 'linear-gradient(135deg, rgba(30, 15, 15, 0.95), rgba(45, 20, 20, 0.95))';
  toast.style.border = isSuccess
    ? '1px solid rgba(79, 70, 229, 0.5)'
    : '1px solid rgba(239, 68, 68, 0.5)';

  toast.innerHTML = `${iconSvg}<span>${message}</span>`;
  toast.style.transform = 'translateY(0)';
  toast.style.opacity = '1';

  setTimeout(() => {
    if (toast) {
      toast.style.transform = 'translateY(20px)';
      toast.style.opacity = '0';
    }
  }, 3500);
}

// Extract media sources from <video>, <audio>, <source>, blob URLs, and data attributes
function extractMediaSources(videoEl: HTMLVideoElement): { url: string; type: 'hls' | 'dash' | 'direct' | 'blob' }[] {
  const sources: { url: string; type: 'hls' | 'dash' | 'direct' | 'blob' }[] = [];
  const visited = new Set<string>();

  function addSource(rawUrl: string | null | undefined, typeHint?: 'hls' | 'dash' | 'direct' | 'blob') {
    if (!rawUrl) return;
    const url = rawUrl.trim();
    if (!url || visited.has(url)) return;
    visited.add(url);

    let type: 'hls' | 'dash' | 'direct' | 'blob' = typeHint || 'direct';
    if (url.startsWith('blob:')) {
      type = 'blob';
    } else if (url.includes('.m3u8') || url.includes('application/x-mpegURL') || url.includes('application/vnd.apple.mpegurl')) {
      type = 'hls';
    } else if (url.includes('.mpd') || url.includes('application/dash+xml')) {
      type = 'dash';
    }

    sources.push({ url, type });
  }

  // 1. Direct src and currentSrc
  if (videoEl.currentSrc) addSource(videoEl.currentSrc);
  if (videoEl.src) addSource(videoEl.src);

  // 2. Child <source> elements
  const sourceChildren = videoEl.querySelectorAll('source');
  sourceChildren.forEach((srcTag) => {
    const src = (srcTag as HTMLSourceElement).src;
    const typeAttr = (srcTag as HTMLSourceElement).type || '';
    if (typeAttr.includes('mpegurl') || typeAttr.includes('m3u8')) {
      addSource(src, 'hls');
    } else if (typeAttr.includes('dash') || typeAttr.includes('mpd')) {
      addSource(src, 'dash');
    } else {
      addSource(src);
    }
  });

  // 3. Custom attributes frequently used by video players
  const dataAttributes = ['data-src', 'data-hls-src', 'data-dash-src', 'data-orig-src', 'data-video-url', 'data-url'];
  for (const attr of dataAttributes) {
    const val = videoEl.getAttribute(attr);
    if (val) addSource(val);
  }

  return sources;
}

// Extract page title or YouTube title cleanly
function getCleanMediaTitle(): string {
  const isYouTube = window.location.hostname.includes('youtube.com') || window.location.hostname.includes('youtu.be');
  if (isYouTube) {
    const ytTitleEl = document.querySelector('h1.ytd-watch-metadata yt-formatted-string, #title h1 yt-formatted-string, h1.title');
    if (ytTitleEl && ytTitleEl.textContent) {
      return ytTitleEl.textContent.trim().replace(/[\\/:*?"<>|]/g, '_').substring(0, 120);
    }
  }

  const rawTitle = document.title || 'Segmenta_Video';
  return rawTitle
    .replace(/\s*-\s*YouTube$/, '')
    .replace(/[\\/:*?"<>|]/g, '_')
    .trim()
    .substring(0, 120);
}

// Keep track of active overlay per player container
let activeOverlayMap = new WeakMap<HTMLVideoElement, HTMLElement>();

function injectDownloadOverlay(videoEl: HTMLVideoElement) {
  // Ignore already dismissed or tiny preview videos (e.g. YouTube thumbnails or background audio elements)
  if (videoEl.dataset.segmentaDismissed === 'true') return;
  if (activeOverlayMap.has(videoEl)) return;

  const rect = videoEl.getBoundingClientRect();
  // Filter out tiny thumbnail previews or hidden zero-sized video elements
  if (rect.width < 240 || rect.height < 140) return;

  const container = document.createElement('div');
  container.className = 'segmenta-media-grabber';
  container.style.position = 'absolute';
  container.style.zIndex = '2147483640';
  container.style.display = 'flex';
  container.style.alignItems = 'center';
  container.style.gap = '6px';
  container.style.background = 'rgba(15, 23, 42, 0.92)';
  container.style.backdropFilter = 'blur(12px)';
  container.style.border = '1px solid rgba(99, 102, 241, 0.45)';
  container.style.borderRadius = '8px';
  container.style.padding = '4px 6px';
  container.style.boxShadow = '0 8px 24px rgba(0, 0, 0, 0.4), 0 2px 6px rgba(79, 70, 229, 0.2)';
  container.style.fontFamily = 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  container.style.transition = 'opacity 0.2s ease, transform 0.2s ease';
  container.style.userSelect = 'none';
  container.style.opacity = '0.9';

  container.onmouseenter = () => { container.style.opacity = '1'; };
  container.onmouseleave = () => { container.style.opacity = '0.9'; };

  // Primary Action Button: "⚡ Download Video"
  const btn = document.createElement('button');
  btn.className = 'segmenta-btn-download';
  btn.innerHTML = `
    <span style="display: inline-flex; align-items: center; gap: 5px; font-weight: 600; font-size: 11px; color: #ffffff; letter-spacing: -0.01em;">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
      </svg>
      <span>Download</span>
    </span>
  `;
  btn.style.background = 'linear-gradient(135deg, #4f46e5, #4338ca)';
  btn.style.color = '#ffffff';
  btn.style.padding = '4px 8px';
  btn.style.borderRadius = '5px';
  btn.style.border = 'none';
  btn.style.cursor = 'pointer';
  btn.style.transition = 'all 0.15s ease';
  btn.style.boxShadow = '0 2px 6px rgba(79, 70, 229, 0.3)';

  btn.onmouseenter = () => {
    btn.style.background = 'linear-gradient(135deg, #6366f1, #4f46e5)';
    btn.style.transform = 'translateY(-1px)';
  };
  btn.onmouseleave = () => {
    btn.style.background = 'linear-gradient(135deg, #4f46e5, #4338ca)';
    btn.style.transform = 'translateY(0)';
  };

  // Resolution / Quality dropdown
  const qualitySelect = document.createElement('select');
  qualitySelect.className = 'segmenta-quality-select';
  qualitySelect.style.background = 'rgba(30, 41, 59, 0.9)';
  qualitySelect.style.color = '#e2e8f0';
  qualitySelect.style.border = '1px solid rgba(255, 255, 255, 0.15)';
  qualitySelect.style.borderRadius = '5px';
  qualitySelect.style.fontSize = '11px';
  qualitySelect.style.fontWeight = '500';
  qualitySelect.style.padding = '3px 6px';
  qualitySelect.style.outline = 'none';
  qualitySelect.style.cursor = 'pointer';

  const options: { label: string; value: string }[] = [
    { label: 'Auto (Best)', value: 'original' },
    { label: '1080p', value: '1080p' },
    { label: '720p', value: '720p' },
    { label: 'Audio (.mp3)', value: 'audio' },
  ];

  options.forEach((opt) => {
    const el = document.createElement('option');
    el.value = opt.value;
    el.innerText = opt.label;
    el.style.background = '#0f172a';
    el.style.color = '#f8fafc';
    qualitySelect.appendChild(el);
  });

  // Close / Dismiss Button (×)
  const closeBtn = document.createElement('button');
  closeBtn.className = 'segmenta-btn-close';
  closeBtn.title = 'Dismiss download overlay for this video';
  closeBtn.innerHTML = `
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <line x1="18" y1="6" x2="6" y2="18"></line>
      <line x1="6" y1="6" x2="18" y2="18"></line>
    </svg>
  `;
  closeBtn.style.background = 'transparent';
  closeBtn.style.border = 'none';
  closeBtn.style.borderRadius = '4px';
  closeBtn.style.padding = '3px';
  closeBtn.style.cursor = 'pointer';
  closeBtn.style.display = 'flex';
  closeBtn.style.alignItems = 'center';
  closeBtn.style.justifyContent = 'center';
  closeBtn.style.transition = 'background 0.15s ease';

  closeBtn.onmouseenter = () => {
    closeBtn.style.background = 'rgba(255, 255, 255, 0.1)';
  };
  closeBtn.onmouseleave = () => {
    closeBtn.style.background = 'transparent';
  };

  closeBtn.onclick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    videoEl.dataset.segmentaDismissed = 'true';
    container.remove();
    activeOverlayMap.delete(videoEl);
  };

  // Handle Download trigger
  btn.onclick = (e) => {
    e.preventDefault();
    e.stopPropagation();

    const isYouTube = window.location.hostname.includes('youtube.com') || window.location.hostname.includes('youtu.be');
    const sources = extractMediaSources(videoEl);
    let targetSrc = '';
    let targetType: 'hls' | 'dash' | 'direct' | 'blob' = 'direct';

    if (sources.length > 0) {
      const hlsSource = sources.find((s) => s.type === 'hls');
      const dashSource = sources.find((s) => s.type === 'dash');
      const directSource = sources.find((s) => s.type === 'direct');
      const chosen = hlsSource || dashSource || directSource || sources[0];
      targetSrc = chosen.url;
      targetType = chosen.type;
    } else if (videoEl.currentSrc || videoEl.src) {
      targetSrc = videoEl.currentSrc || videoEl.src;
    }

    if ((!targetSrc || targetSrc.startsWith('blob:')) && isYouTube) {
      targetSrc = window.location.href;
      targetType = 'direct';
    }

    if (!targetSrc) {
      showToast('Video URL not ready yet. Please play the video.', false);
      return;
    }

    const selectedQuality = qualitySelect.value;
    const isAudioOnly = selectedQuality === 'audio';
    const cleanTitle = getCleanMediaTitle();
    const ext = isAudioOnly ? 'mp3' : 'mp4';
    const filename = `${cleanTitle}_${selectedQuality}.${ext}`;

    btn.innerHTML = `
      <span style="display: inline-flex; align-items: center; gap: 4px; font-weight: 600; font-size: 11px; color: #ffffff;">
        <svg class="animate-spin" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2.5">
          <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-opacity="0.25"></circle>
          <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor"></path>
        </svg>
        <span>Sending...</span>
      </span>
    `;
    btn.style.background = '#059669';

    chrome.runtime.sendMessage(
      {
        type: 'SNIFFED_MEDIA',
        url: targetSrc,
        title: cleanTitle,
        filename,
        pageUrl: window.location.href,
        mediaType: targetType,
        quality: selectedQuality,
        format: ext,
      },
      (res) => {
        const error = chrome.runtime.lastError || (res && res.error);
        if (error) {
          showToast(`Dispatch failed: ${error.message || error}`, false);
          btn.innerHTML = `<span>Error</span>`;
          btn.style.background = '#dc2626';
        } else {
          showToast(`Sent to Segmenta: "${filename}"`);
          btn.innerHTML = `<span>Dispatched ✓</span>`;
          btn.style.background = '#059669';
        }

        setTimeout(() => {
          btn.innerHTML = `
            <span style="display: inline-flex; align-items: center; gap: 5px; font-weight: 600; font-size: 11px; color: #ffffff;">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
              </svg>
              <span>Download</span>
            </span>
          `;
          btn.style.background = 'linear-gradient(135deg, #4f46e5, #4338ca)';
        }, 2500);
      }
    );
  };

  container.appendChild(btn);
  container.appendChild(qualitySelect);
  container.appendChild(closeBtn);

  function updatePosition() {
    if (!document.body.contains(videoEl) || videoEl.dataset.segmentaDismissed === 'true') {
      container.remove();
      activeOverlayMap.delete(videoEl);
      return;
    }

    const r = videoEl.getBoundingClientRect();
    if (r.width < 240 || r.height < 140 || window.getComputedStyle(videoEl).display === 'none' || window.getComputedStyle(videoEl).visibility === 'hidden') {
      container.style.display = 'none';
      return;
    }

    const playerParent = videoEl.closest('#movie_player') || videoEl.parentElement;
    if (playerParent && window.getComputedStyle(playerParent).position !== 'static') {
      container.style.display = 'flex';
      container.style.top = '10px';
      container.style.left = '10px';
      if (container.parentElement !== playerParent) {
        playerParent.appendChild(container);
      }
    } else {
      container.style.display = 'flex';
      container.style.top = `${window.scrollY + r.top + 8}px`;
      container.style.left = `${window.scrollX + r.left + 8}px`;
      if (container.parentElement !== document.body) {
        document.body.appendChild(container);
      }
    }
  }

  updatePosition();
  activeOverlayMap.set(videoEl, container);

  window.addEventListener('resize', updatePosition);
  window.addEventListener('scroll', updatePosition, { passive: true });
  videoEl.addEventListener('play', updatePosition);
  videoEl.addEventListener('loadeddata', updatePosition);
}

// Scan media elements with debouncing to prevent multi-trigger stacking
let scanTimeout: any = null;
function scanMedia() {
  clearTimeout(scanTimeout);
  scanTimeout = setTimeout(() => {
    // Only target visible, substantial video elements
    const videos = Array.from(document.querySelectorAll('video')) as HTMLVideoElement[];
    videos.forEach((v) => {
      const r = v.getBoundingClientRect();
      if (r.width >= 240 && r.height >= 140) {
        injectDownloadOverlay(v);
      }
    });
  }, 300);
}

scanMedia();

// Observer for dynamic players (SPAs)
const observer = new MutationObserver(() => {
  scanMedia();
});
observer.observe(document.body, { childList: true, subtree: true });
