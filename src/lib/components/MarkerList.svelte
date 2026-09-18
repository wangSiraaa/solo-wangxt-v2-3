<script lang="ts">
  /** 标记列表：双击波形添加，刷新后从 IndexedDB 恢复 */
  import { app, removeMarker } from '../state/app.svelte';
</script>

<div class="panel">
  <h3>标记（{app.markers.length}）</h3>
  {#if app.markers.length}
    <ul>
      {#each app.markers as m (m.id)}
        <li>
          <span class="label">{m.label}</span>
          <span class="time">{m.time.toFixed(3)} s</span>
          <button class="del" onclick={() => removeMarker(m.id)} title="删除标记">×</button>
        </li>
      {/each}
    </ul>
  {:else}
    <p class="dim">在波形上双击添加标记；刷新页面后自动恢复。</p>
  {/if}
</div>

<style>
  .panel {
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 0.6rem 0.8rem;
  }
  h3 {
    margin: 0 0 0.4rem;
    font-size: 0.95rem;
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    max-height: 10em;
    overflow-y: auto;
    font-size: 0.85rem;
  }
  li {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    padding: 0.1rem 0;
  }
  .label {
    color: #22c55e;
    font-weight: 600;
  }
  .time {
    font-family: ui-monospace, monospace;
    color: var(--text-h);
    flex: 1;
  }
  .del {
    border: none;
    background: none;
    color: var(--text);
    cursor: pointer;
    padding: 0 0.3rem;
  }
  .del:hover {
    color: #ef4444;
  }
  .dim {
    color: var(--text);
    font-size: 0.85rem;
  }
</style>
