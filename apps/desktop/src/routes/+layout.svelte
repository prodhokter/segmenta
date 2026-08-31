<script lang="ts">
  import '../app.css';
  let { children } = $props();
</script>

<div class="min-h-screen bg-canvas text-body flex flex-col font-sans">
  {@render children()}
</div>
