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
  }, 4000);
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

  // 2. Child <source> and <track> elements
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

  // 3. Custom attributes frequently used by video players (e.g. data-src, data-hls-src, data-dash-src, etc.)
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
    // Try YouTube video title element
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

// Function to inject download overlay over video or player container
function injectDownloadOverlay(videoEl: HTMLVideoElement) {
  if (videoEl.dataset.segmentaInjected) return;
  videoEl.dataset.segmentaInjected = 'true';

  const container = document.createElement('div');
  container.className = 'segmenta-media-grabber';
  container.style.position = 'absolute';
  container.style.zIndex = '2147483647';
  container.style.display = 'flex';
  container.style.alignItems = 'center';
  container.style.gap = '6px';
  container.style.background = 'rgba(15, 23, 42, 0.92)';
  container.style.backdropFilter = 'blur(12px)';
  container.style.border = '1px solid rgba(99, 102, 241, 0.4)';
  container.style.borderRadius = '8px';
  container.style.padding = '5px 8px';
  container.style.boxShadow = '0 8px 32px rgba(0, 0, 0, 0.5), 0 2px 8px rgba(79, 70, 229, 0.25)';
  container.style.fontFamily = 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  container.style.transition = 'opacity 0.2s ease, transform 0.2s ease';
  container.style.userSelect = 'none';

  // Primary Action Button: "⚡ Download Video"
  const btn = document.createElement('button');
  btn.className = 'segmenta-btn-download';
  btn.innerHTML = `
    <span style="display: inline-flex; align-items: center; gap: 6px; font-weight: 600; font-size: 12px; color: #ffffff; letter-spacing: -0.01em;">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
      </svg>
      <span>Download Video</span>
    </span>
  `;
  btn.style.background = 'linear-gradient(135deg, #4f46e5, #4338ca)';
  btn.style.color = '#ffffff';
  btn.style.padding = '5px 10px';
  btn.style.borderRadius = '6px';
  btn.style.border = 'none';
  btn.style.cursor = 'pointer';
  btn.style.transition = 'all 0.15s ease';
  btn.style.boxShadow = '0 2px 6px rgba(79, 70, 229, 0.4)';

  btn.onmouseenter = () => {
    btn.style.background = 'linear-gradient(135deg, #6366f1, #4f46e5)';
    btn.style.transform = 'translateY(-1px)';
  };
  btn.onmouseleave = () => {
    btn.style.background = 'linear-gradient(135deg, #4f46e5, #4338ca)';
    btn.style.transform = 'translateY(0)';
  };

  // Resolution / Quality dropdown: Original / 1080p / 720p / Audio only
  const qualitySelect = document.createElement('select');
  qualitySelect.className = 'segmenta-quality-select';
  qualitySelect.style.background = 'rgba(30, 41, 59, 0.9)';
  qualitySelect.style.color = '#e2e8f0';
  qualitySelect.style.border = '1px solid rgba(255, 255, 255, 0.15)';
  qualitySelect.style.borderRadius = '6px';
  qualitySelect.style.fontSize = '11px';
  qualitySelect.style.fontWeight = '500';
  qualitySelect.style.padding = '4px 8px';
  qualitySelect.style.outline = 'none';
  qualitySelect.style.cursor = 'pointer';
  qualitySelect.style.transition = 'border-color 0.15s ease';

  const options: { label: string; value: string }[] = [
    { label: 'Original Quality', value: 'original' },
    { label: '1080p Full HD', value: '1080p' },
    { label: '720p HD', value: '720p' },
    { label: 'Audio Only (.mp3)', value: 'audio' },
  ];

  options.forEach((opt) => {
    const el = document.createElement('option');
    el.value = opt.value;
    el.innerText = opt.label;
    el.style.background = '#0f172a';
    el.style.color = '#f8fafc';
    qualitySelect.appendChild(el);
  });

  // Handle Download trigger
  btn.onclick = (e) => {
    e.preventDefault();
    e.stopPropagation();

    const isYouTube = window.location.hostname.includes('youtube.com') || window.location.hostname.includes('youtu.be');
    const sources = extractMediaSources(videoEl);
    let targetSrc = '';
    let targetType: 'hls' | 'dash' | 'direct' | 'blob' = 'direct';

    if (sources.length > 0) {
      // Prioritize HLS / DASH stream if available, otherwise direct or blob
      const hlsSource = sources.find((s) => s.type === 'hls');
      const dashSource = sources.find((s) => s.type === 'dash');
      const directSource = sources.find((s) => s.type === 'direct');
      const chosen = hlsSource || dashSource || directSource || sources[0];
      targetSrc = chosen.url;
      targetType = chosen.type;
    } else if (videoEl.currentSrc || videoEl.src) {
      targetSrc = videoEl.currentSrc || videoEl.src;
    }

    // Special handling for YouTube or blob-only streams: if targetSrc is blob or missing, fallback to current page URL
    if ((!targetSrc || targetSrc.startsWith('blob:')) && isYouTube) {
      targetSrc = window.location.href;
      targetType = 'direct';
    }

    if (!targetSrc) {
      showToast('Video source URL not detected yet. Please play the video for 1 second.', false);
      return;
    }

    const selectedQuality = qualitySelect.value;
    const isAudioOnly = selectedQuality === 'audio';
    const cleanTitle = getCleanMediaTitle();
    const ext = isAudioOnly ? 'mp3' : 'mp4';
    const filename = `${cleanTitle}_${selectedQuality}.${ext}`;

    btn.innerHTML = `
      <span style="display: inline-flex; align-items: center; gap: 5px; font-weight: 600; font-size: 12px; color: #ffffff;">
        <svg class="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2.5">
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
          btn.innerHTML = `
            <span style="display: inline-flex; align-items: center; gap: 6px; font-weight: 600; font-size: 12px; color: #ffffff;">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2.5">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="12" y1="8" x2="12" y2="12"></line>
                <line x1="12" y1="16" x2="12.01" y2="16"></line>
              </svg>
              <span>Error</span>
            </span>
          `;
          btn.style.background = '#dc2626';
        } else {
          showToast(`Sent to Segmenta: "${filename}"`);
          btn.innerHTML = `
            <span style="display: inline-flex; align-items: center; gap: 5px; font-weight: 600; font-size: 12px; color: #ffffff;">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
              <span>Dispatched</span>
            </span>
          `;
          btn.style.background = '#059669';
        }

        setTimeout(() => {
          btn.innerHTML = `
            <span style="display: inline-flex; align-items: center; gap: 6px; font-weight: 600; font-size: 12px; color: #ffffff;">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
              </svg>
              <span>Download Video</span>
            </span>
          `;
          btn.style.background = 'linear-gradient(135deg, #4f46e5, #4338ca)';
        }, 2500);
      }
    );
  };

  container.appendChild(btn);
  container.appendChild(qualitySelect);

  function updatePosition() {
    if (!document.body.contains(videoEl)) {
      container.remove();
      return;
    }

    const rect = videoEl.getBoundingClientRect();
    if (rect.width < 120 || rect.height < 80 || window.getComputedStyle(videoEl).display === 'none') {
      container.style.display = 'none';
      return;
    }

    // Try anchoring inside player container on YouTube / video platforms if possible
    const playerParent = videoEl.closest('#movie_player') || videoEl.parentElement;
    if (playerParent && window.getComputedStyle(playerParent).position !== 'static') {
      container.style.display = 'flex';
      container.style.top = '12px';
      container.style.left = '12px';
      if (container.parentElement !== playerParent) {
        playerParent.appendChild(container);
      }
    } else {
      container.style.display = 'flex';
      container.style.top = `${window.scrollY + rect.top + 10}px`;
      container.style.left = `${window.scrollX + rect.left + 10}px`;
      if (container.parentElement !== document.body) {
        document.body.appendChild(container);
      }
    }
  }

  updatePosition();
  window.addEventListener('resize', updatePosition);
  window.addEventListener('scroll', updatePosition, { passive: true });

  // Update on play / timeupdate to catch dynamic stream attachments
  videoEl.addEventListener('play', updatePosition);
  videoEl.addEventListener('loadeddata', updatePosition);
}

// Sniff iframe video players (YouTube, Vimeo, Dailymotion, custom embeds)
function scanIframePlayers() {
  const iframes = document.querySelectorAll('iframe');
  iframes.forEach((iframe) => {
    const src = iframe.src || iframe.getAttribute('data-src');
    if (!src) return;
    const lowerSrc = src.toLowerCase();
    if (
      lowerSrc.includes('youtube.com/embed') ||
      lowerSrc.includes('player.vimeo.com') ||
      lowerSrc.includes('dailymotion.com/embed') ||
      lowerSrc.includes('embed')
    ) {
      if (iframe.dataset.segmentaIframeInjected) return;
      iframe.dataset.segmentaIframeInjected = 'true';

      // Send to background for stream registration
      chrome.runtime.sendMessage({
        type: 'SNIFFED_MEDIA',
        url: src,
        title: document.title || 'Embedded Video Player',
        pageUrl: window.location.href,
        mediaType: 'direct',
      });
    }
  });
}

// Initial scan
function scanMedia() {
  document.querySelectorAll('video').forEach((v) => injectDownloadOverlay(v as HTMLVideoElement));
  scanIframePlayers();
}

scanMedia();

// Mutation observer for dynamically rendered media (SPAs, React/Vue players, VideoJS, JWPlayer, etc.)
const observer = new MutationObserver(() => {
  scanMedia();
});

observer.observe(document.body, { childList: true, subtree: true });
