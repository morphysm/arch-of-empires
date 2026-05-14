<script>
  import { onMount, onDestroy } from 'svelte';
  import babalonImg from '../assets/babalon.png';

  let imgEl;
  let flickering  = false;
  let flickerDone = false;
  const timers = [];
  let strobeInterval = null;

  onMount(() => {
    // Wait for letter text to fully arrive (letter-arrive is 1.8s), then flicker in
    timers.push(setTimeout(() => {
      flickering = true;

      timers.push(setTimeout(() => {
        flickering  = false;
        flickerDone = true;
        if (imgEl) imgEl.style.opacity = '1';

        // Hold 7s, then strobe out
        timers.push(setTimeout(() => {
          let count = 0;
          strobeInterval = setInterval(() => {
            count++;
            if (imgEl) imgEl.style.opacity = count % 2 === 0 ? '1' : '0';
            if (count >= 8) {
              clearInterval(strobeInterval);
              strobeInterval = null;
              if (imgEl) imgEl.style.display = 'none';
            }
          }, 80);
        }, 7000));
      }, 1200));
    }, 2000));
  });

  onDestroy(() => {
    timers.forEach(t => clearTimeout(t));
    if (strobeInterval) clearInterval(strobeInterval);
  });
</script>

<div class="babalon-wrap">
  <img
    bind:this={imgEl}
    src={babalonImg}
    alt=""
    class="babalon-img"
    class:babalon-flicker={flickering}
  />
</div>

<style>
  .babalon-wrap {
    position: relative;
    width: 280px;
    margin: 1.5rem auto 0;
    overflow: hidden;
  }

  /* Scanline overlay — image looks like it leaked into the terminal */
  .babalon-wrap::after {
    content: '';
    position: absolute;
    inset: 0;
    background: repeating-linear-gradient(
      to bottom,
      transparent 0px,
      transparent 2px,
      rgba(0, 0, 0, 0.15) 2px,
      rgba(0, 0, 0, 0.15) 4px
    );
    pointer-events: none;
  }

  .babalon-img {
    max-width: 280px;
    width: 100%;
    height: auto;
    display: block;
    filter: contrast(1.2) brightness(0.95) opacity(0.9);
    mix-blend-mode: screen;
    opacity: 0;
  }

  .babalon-flicker {
    animation: babalon-flicker 1.2s forwards;
  }

  @keyframes babalon-flicker {
    0%   { opacity: 0; }
    8%   { opacity: 0.85; }
    13%  { opacity: 0; }
    24%  { opacity: 1; }
    30%  { opacity: 0.35; }
    40%  { opacity: 0.9; }
    47%  { opacity: 0.15; }
    56%  { opacity: 1; }
    66%  { opacity: 0.65; }
    76%  { opacity: 1; }
    89%  { opacity: 0.55; }
    100% { opacity: 1; }
  }
</style>
