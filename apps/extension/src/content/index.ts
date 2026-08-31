interface SniffedMedia {
  url: string;
  type: string;
  title: string;
}

function extractMediaSources(videoEl: HTMLVideoElement): string[] {
  const sources: string[] = [];
  if (videoEl.currentSrc) sources.push(videoEl.currentSrc);
  if (videoEl.src && !sources.includes(videoEl.src)) sources.push(videoEl.src);

  const sourceChildren = videoEl.querySelectorAll('source');
  sourceChildren.forEach((srcTag) => {
    const src = (srcTag as HTMLSourceElement).src;
    if (src && !sources.includes(src)) {
      sources.push(src);
    }
  });

  return sources.filter((s) => s.startsWith('http') || s.startsWith('blob:') || s.endsWith('.m3u8') || s.endsWith('.mp4'));
}

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
  container.style.background = 'rgba(15, 23, 42, 0.85)';
  container.style.backdropFilter = 'blur(8px)';
  container.style.border = '1px solid rgba(255, 255, 255, 0.15)';
  container.style.borderRadius = '8px';
  container.style.padding = '4px 8px';
  container.style.boxShadow = '0 4px 20px rgba(0,0,0,0.35)';
  container.style.fontFamily = 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  container.style.transition = 'opacity 0.2s ease, transform 0.2s ease';

  const btn = document.createElement('button');
  btn.innerHTML = `
    <span style="display: inline-flex; align-items: center; gap: 5px; font-weight: 600; font-size: 12px; color: #ffffff;">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#06b6d4" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
        <polyline points="7 10 12 15 17 10"></polyline>
        <line x1="12" y1="15" x2="12" y2="3"></line>
      </svg>
      Download Media
    </span>
  `;
  btn.style.background = '#4f46e5';
  btn.style.color = '#ffffff';
  btn.style.padding = '5px 10px';
  btn.style.borderRadius = '6px';
  btn.style.border = 'none';
  btn.style.cursor = 'pointer';
  btn.style.transition = 'background 0.15s ease';

  btn.onmouseenter = () => {
    btn.style.background = '#4338ca';
  };
  btn.onmouseleave = () => {
    btn.style.background = '#4f46e5';
  };

  const qualitySelect = document.createElement('select');
  qualitySelect.style.background = 'rgba(255, 255, 255, 0.08)';
  qualitySelect.style.color = '#e2e8f0';
  qualitySelect.style.border = '1px solid rgba(255, 255, 255, 0.1)';
  qualitySelect.style.borderRadius = '4px';
  qualitySelect.style.fontSize = '11px';
  qualitySelect.style.padding = '4px 6px';
  qualitySelect.style.outline = 'none';
  qualitySelect.style.cursor = 'pointer';

  const optAuto = document.createElement('option');
  optAuto.value = 'auto';
  optAuto.innerText = 'Best (Direct)';
  optAuto.style.background = '#0f172a';
  qualitySelect.appendChild(optAuto);

  const opt1080 = document.createElement('option');
  opt1080.value = '1080';
  opt1080.innerText = '1080p Full HD';
  opt1080.style.background = '#0f172a';
  qualitySelect.appendChild(opt1080);

  const opt720 = document.createElement('option');
  opt720.value = '720';
  opt720.innerText = '720p HD';
  opt720.style.background = '#0f172a';
  qualitySelect.appendChild(opt720);

  btn.onclick = (e) => {
    e.preventDefault();
    e.stopPropagation();

    const sources = extractMediaSources(videoEl);
    const selectedSrc = sources.length > 0 ? sources[0] : (videoEl.currentSrc || videoEl.src);

    if (selectedSrc) {
      btn.innerText = 'Sending...';
      btn.style.background = '#059669';

      chrome.runtime.sendMessage(
        {
          type: 'SNIFFED_MEDIA',
          url: selectedSrc,
          title: document.title,
          pageUrl: window.location.href,
        },
        (res) => {
          setTimeout(() => {
            btn.innerHTML = `
              <span style="display: inline-flex; align-items: center; gap: 5px; font-weight: 600; font-size: 12px; color: #ffffff;">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
                Queued
              </span>
            `;
          }, 400);
        }
      );
    }
  };

  container.appendChild(btn);
  container.appendChild(qualitySelect);

  function updatePosition() {
    const rect = videoEl.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0 || window.getComputedStyle(videoEl).display === 'none') {
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

  document.body.appendChild(container);
}

// Initial scan
document.querySelectorAll('video').forEach((v) => injectDownloadOverlay(v as HTMLVideoElement));

// Mutation observer for dynamically rendered media (SPAs, YouTube, Vimeo, etc.)
const observer = new MutationObserver(() => {
  document.querySelectorAll('video').forEach((v) => injectDownloadOverlay(v as HTMLVideoElement));
});

observer.observe(document.body, { childList: true, subtree: true });
