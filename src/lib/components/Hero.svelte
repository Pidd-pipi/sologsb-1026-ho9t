<script lang="ts">
  interface HeroStat {
    value: number | string;
    label: string;
    tone?: 'critical' | 'caution' | 'ok';
  }
  export let kicker: string;
  export let title: string;
  export let subtitle: string;
  export let stats: HeroStat[] = [];
</script>

<section class="course-hero">
  <div class="hero-copy">
    <span class="kicker">{kicker}</span>
    <h2>{title}</h2>
    <p>{subtitle}</p>
  </div>
  {#if stats.length}
    <div class="hero-stats">
      {#each stats as stat}
        <div><strong class={stat.tone ?? ''}>{stat.value}</strong><span>{stat.label}</span></div>
      {/each}
    </div>
  {/if}
</section>
