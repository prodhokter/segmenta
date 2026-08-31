interface SniffedMedia {
  url: string;
  type: 'hls' | 'dash' | 'direct' | 'blob';
  title: string;
  quality?: string;
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
  const dataAttributes = ['data-src', 'data-hls-src', 'data-dash-src', 'data-orig-src', 'data-video-url'];
  for (const attr of dataAttributes) {
    const val = videoEl.getAttribute(attr);
    if (val) addSource(val);
  }

  return sources;
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

    if (!targetSrc) {
      alert('Segmenta: Video source URL not detected yet. Please play the video for 1 second.');
      return;
    }

    const selectedQuality = qualitySelect.value;
    const isAudioOnly = selectedQuality === 'audio';
    const pageTitle = document.title || 'Video';
    const cleanTitle = pageTitle.replace(/[\\/:*?"<>|]/g, '_').substring(0, 100);
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
      () => {
        setTimeout(() => {
          btn.innerHTML = `
            <span style="display: inline-flex; align-items: center; gap: 5px; font-weight: 600; font-size: 12px; color: #ffffff;">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
              <span>Dispatched</span>
            </span>
          `;
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
          }, 3000);
        }, 300);
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

    container.style.display = 'flex';
    container.style.top = `${window.scrollY + rect.top + 10}px`;
    container.style.left = `${window.scrollX + rect.left + 10}px`;
  }

  updatePosition();
  window.addEventListener('resize', updatePosition);
  window.addEventListener('scroll', updatePosition, { passive: true });

  // Update on play / timeupdate to catch dynamic stream attachments
  videoEl.addEventListener('play', updatePosition);
  videoEl.addEventListener('loadeddata', updatePosition);

  document.body.appendChild(container);
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
