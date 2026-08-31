<script lang="ts">
  import { onMount } from 'svelte';
  import { t, type LanguageCode } from '$lib/i18n';
  import { Activity, Zap, TrendingUp, Radio } from 'lucide-svelte';

  interface Props {
    currentSpeedBytes?: number;
    currentLang?: LanguageCode;
  }

  let { currentSpeedBytes = 0, currentLang = 'en' }: Props = $props();

  let canvas: HTMLCanvasElement | undefined = $state();
  let history: number[] = Array(35).fill(0);
  let peakSpeedBytes = $state(0);

  function formatSpeed(bytes: number): string {
    if (bytes >= 1024 * 1024 * 1024) return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB/s';
    if (bytes >= 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB/s';
    if (bytes >= 1024) return (bytes / 1024).toFixed(0) + ' KB/s';
    return bytes + ' B/s';
  }

  $effect(() => {
    const speed = currentSpeedBytes;
    if (speed > peakSpeedBytes) {
      peakSpeedBytes = speed;
    }
    if (!canvas) return;
    history.push(speed);
    if (history.length > 35) history.shift();
    renderChart();
  });

  function renderChart() {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    const rect = canvas.getBoundingClientRect();
    const w = rect.width || 240;
    const h = rect.height || 64;

    if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
      canvas.width = w * dpr;
      canvas.height = h * dpr;
    }

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);

    const max = Math.max(...history, 1024 * 1024); // at least 1MB/s scale
    const stepX = w / (history.length - 1);

    // Draw Grid Lines (Subtle horizontal reference lines)
    ctx.strokeStyle = document.documentElement.classList.contains('dark')
      ? 'rgba(255, 255, 255, 0.05)'
      : 'rgba(0, 0, 0, 0.04)';
    ctx.lineWidth = 1;
    [0.25, 0.5, 0.75].forEach((ratio) => {
      const y = h * ratio;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    });

    // Generate smooth bezier curve path
    ctx.beginPath();
    ctx.moveTo(0, h);

    // Initial point
    const firstY = h - (history[0] / max) * (h - 10);
    ctx.lineTo(0, firstY);

    for (let i = 0; i < history.length - 1; i++) {
      const x0 = i * stepX;
      const y0 = h - (history[i] / max) * (h - 10);
      const x1 = (i + 1) * stepX;
      const y1 = h - (history[i + 1] / max) * (h - 10);
      const midX = (x0 + x1) / 2;
      ctx.bezierCurveTo(midX, y0, midX, y1, x1, y1);
    }

    ctx.lineTo(w, h);
    ctx.closePath();

    // High-end smooth gradient
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, 'rgba(79, 70, 229, 0.50)');
    grad.addColorStop(0.5, 'rgba(6, 182, 212, 0.20)');
    grad.addColorStop(1, 'rgba(79, 70, 229, 0.00)');
    ctx.fillStyle = grad;
    ctx.fill();

    // Draw active stroke line
    ctx.beginPath();
    for (let i = 0; i < history.length - 1; i++) {
      const x0 = i * stepX;
      const y0 = h - (history[i] / max) * (h - 10);
      const x1 = (i + 1) * stepX;
      const y1 = h - (history[i + 1] / max) * (h - 10);
      const midX = (x0 + x1) / 2;
      if (i === 0) ctx.moveTo(x0, y0);
      ctx.bezierCurveTo(midX, y0, midX, y1, x1, y1);
    }

    // Glow stroke
    ctx.strokeStyle = '#4f46e5';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();

    // Draw glowing pulsing head point
    const lastX = (history.length - 1) * stepX;
    const lastY = h - (history[history.length - 1] / max) * (h - 10);

    ctx.beginPath();
    ctx.arc(lastX, lastY, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#06b6d4';
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.restore();
  }

  onMount(() => {
    renderChart();
    const resizeObserver = new ResizeObserver(() => renderChart());
    if (canvas) resizeObserver.observe(canvas);
    return () => resizeObserver.disconnect();
  });
</script>

<div class="bg-surface dark:bg-surface-dark border border-border-light dark:border-border-dark rounded-2xl p-4 sm:p-5 shadow-ambient flex flex-col justify-between relative overflow-hidden">
  <!-- Top glow accent bar -->
  <div class="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-primary via-secondary to-indigo-500 opacity-80"></div>

  <div class="flex items-center justify-between mb-3">
    <div class="flex items-center gap-2">
      <div class="w-7 h-7 rounded-lg bg-primary/10 dark:bg-primary/20 flex items-center justify-center text-primary dark:text-indigo-400">
        <Activity class="w-4 h-4" />
      </div>
      <div>
        <h4 class="text-xs font-bold uppercase tracking-wider text-subtle dark:text-zinc-400">
          {t('speed.title', currentLang)}
        </h4>
      </div>
    </div>

    <div class="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 text-[11px] font-mono font-bold border border-emerald-500/20">
      <Radio class="w-3 h-3 animate-pulse text-emerald-500" />
      <span>{currentSpeedBytes > 0 ? 'STREAMING' : 'IDLE'}</span>
    </div>
  </div>

  <div class="grid grid-cols-1 sm:grid-cols-12 gap-4 items-end">
    <!-- Main metrics -->
    <div class="sm:col-span-5">
      <div class="text-3xl sm:text-4xl font-extrabold font-mono text-heading dark:text-white tracking-tight flex items-baseline gap-1">
        {formatSpeed(currentSpeedBytes)}
      </div>
      <div class="flex items-center gap-3 mt-1.5 text-xs text-subtle dark:text-zinc-400 font-mono">
        <span class="flex items-center gap-1">
          <TrendingUp class="w-3.5 h-3.5 text-secondary" />
          {t('speed.peak_speed', currentLang)}: <strong class="text-heading dark:text-zinc-200">{formatSpeed(peakSpeedBytes)}</strong>
        </span>
      </div>
    </div>

    <!-- Live dynamic gradient chart -->
    <div class="sm:col-span-7 h-16 w-full flex items-end">
      <canvas bind:this={canvas} class="w-full h-full rounded-lg"></canvas>
    </div>
  </div>
</div>
