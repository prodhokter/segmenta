<script lang="ts">
  import { onMount } from 'svelte';

  interface Props {
    currentSpeedBytes?: number;
  }

  let { currentSpeedBytes = 0 }: Props = $props();

  let canvas: HTMLCanvasElement | undefined = $state();
  let history: number[] = Array(30).fill(0);

  function formatSpeed(bytes: number): string {
    if (bytes >= 1024 * 1024 * 1024) return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB/s';
    if (bytes >= 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB/s';
    if (bytes >= 1024) return (bytes / 1024).toFixed(0) + ' KB/s';
    return bytes + ' B/s';
  }

  $effect(() => {
    const speed = currentSpeedBytes;
    if (!canvas) return;
    history.push(speed);
    if (history.length > 30) history.shift();
    renderChart();
  });

  function renderChart() {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const max = Math.max(...history, 1024 * 1024); // at least 1MB/s scale
    ctx.beginPath();
    ctx.moveTo(0, h);

    history.forEach((val, i) => {
      const x = (i / (history.length - 1)) * w;
      const y = h - (val / max) * (h - 8);
      ctx.lineTo(x, y);
    });

    ctx.lineTo(w, h);
    ctx.closePath();

    // Subtle brand gradient
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, 'rgba(79, 70, 229, 0.45)');
    grad.addColorStop(1, 'rgba(79, 70, 229, 0.02)');
    ctx.fillStyle = grad;
    ctx.fill();

    ctx.strokeStyle = '#4f46e5';
    ctx.lineWidth = 2 * dpr;
    ctx.stroke();
  }

  onMount(() => {
    renderChart();
  });
</script>

<div class="bg-surface dark:bg-surface-dark border border-border-light dark:border-border-dark rounded-xl p-4 flex items-center justify-between shadow-ambient">
  <div>
    <span class="text-xs font-semibold uppercase tracking-wider text-subtle dark:text-slate-400">Real-Time Throughput</span>
    <div class="text-2xl font-bold font-mono text-heading dark:text-white mt-0.5 tracking-tight">{formatSpeed(currentSpeedBytes)}</div>
  </div>
  <div class="relative">
    <canvas bind:this={canvas} width="160" height="48" class="rounded"></canvas>
  </div>
</div>
