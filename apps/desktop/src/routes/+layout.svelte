<script lang="ts">
  import '../app.css';
  let { children } = $props();
</script>

<div class="min-h-screen bg-canvas dark:bg-canvas-dark text-body dark:text-slate-300 flex flex-col font-sans transition-colors duration-200">
  {@render children()}
</div>
