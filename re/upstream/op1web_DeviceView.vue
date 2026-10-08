<script setup lang="ts">
import { onMounted } from 'vue';

import { Card, ThemeToggle } from '@/ui';
import { useOp1 } from '@/composables/useOp1';

import DeviceHero from '@/components/op1/DeviceHero.vue';
import AimPanel from '@/components/op1/AimPanel.vue';
import ClickPanel from '@/components/op1/ClickPanel.vue';
import ConnectionPanel from '@/components/op1/ConnectionPanel.vue';
import BindingsPanel from '@/components/op1/BindingsPanel.vue';
import SaveToast from '@/components/op1/SaveToast.vue';

const op1 = useOp1();

// Chrome remembers granted devices, so a reload can pick the mouse back up
// without another permission prompt.
onMounted(() => void op1.reconnect());
</script>

<template>
  <div class="page app-bg">
    <header class="topbar">
      <div class="brand">
        <img src="/brand/eg-mark.png" alt="" width="20" height="20" />
        <span>OP1w&nbsp;4k <em>Config</em></span>
      </div>

      <div class="right">
        <button
          v-if="op1.connected.value"
          type="button" class="tb"
          @click="op1.disconnect()"
        >Disconnect</button>
        <ThemeToggle />
      </div>
    </header>

    <main v-if="!op1.supported.value" class="fallback">
      <Card padding="lg">
        <p class="t">This browser has no WebHID</p>
        <p class="d">
          The mouse is reached directly from the page over WebHID, which ships in Chrome, Edge and
          other Chromium browsers on desktop. Firefox and Safari have not implemented it.
        </p>
      </Card>
    </main>

    <!-- Fixed board: three columns, each panel scrolls inside itself so the page
         as a whole never does. -->
    <main v-else class="board">
      <!-- Short panels share the first column with the hero; the two tall ones
           get a column each, so nothing has to scroll on a wide screen. -->
      <section class="col">
        <div class="cell hero"><DeviceHero /></div>
        <div class="cell grow"><ConnectionPanel /></div>
      </section>

      <section class="col">
        <div class="cell grow"><AimPanel /></div>
      </section>

      <section class="col">
        <div class="cell grow"><ClickPanel /></div>
        <div class="cell grow"><BindingsPanel /></div>
      </section>
    </main>

    <footer class="legal">
      Unofficial and unaffiliated with Endgame Gear. "Endgame Gear" and "OP1w" are their
      trademarks; brand images are their property and are used only to identify the hardware.
    </footer>

    <SaveToast />

  </div>
</template>

<style scoped>
.legal {
  padding: 0 24px 10px;
  font-size: 10.5px; line-height: 1.5; color: var(--text-3);
  text-align: center;
}

.page {
  height: 100dvh;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  background: var(--bg);
  overflow: hidden;
}
/* Panels sit above the ambient wash painted by .app-bg::before. */
.topbar,
.board,
.legal { position: relative; z-index: 1; }

.topbar {
  display: flex; align-items: center; justify-content: space-between; gap: 16px;
  padding: 10px clamp(14px, 2vw, 26px);
  border-bottom: 1px solid var(--glass-line);
  background: color-mix(in srgb, var(--bg) 72%, transparent);
  backdrop-filter: blur(14px);
}
.brand { display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 700; letter-spacing: -0.01em; }
.brand em { font-style: normal; font-weight: 500; color: var(--text-3); }
.right { display: flex; align-items: center; gap: 7px; }

.tb {
  padding: 6px 11px; border-radius: var(--r-sm);
  border: 1px solid var(--glass-line); background: var(--glass);
  font-size: 12px; font-weight: 600; letter-spacing: -0.01em;
  color: var(--text-2); cursor: pointer;
  transition: background var(--dur-1), color var(--dur-1), border-color var(--dur-1);
}
.tb:hover { color: var(--text); border-color: var(--border-strong); }
.tb:focus-visible { outline: 2px solid var(--ring); outline-offset: 2px; }

.board {
  min-height: 0;
  display: grid;
  gap: 12px;
  padding: 12px clamp(12px, 2vw, 26px);
  grid-template-columns: minmax(300px, 0.95fr) minmax(330px, 1.05fr) minmax(310px, 1fr);
}

.col { min-height: 0; display: flex; flex-direction: column; gap: 12px; }

/* A cell hands its Card the leftover height and lets the Card's own content
   scroll, which keeps every border-radius on screen. */
.cell { min-height: 0; display: flex; }
.cell > :deep(.card) { flex: 1; min-height: 0; overflow: auto; }
.cell.grow { flex: 1; }
.cell.hero { flex: 0 0 auto; }
.cell.hero > :deep(*) { flex: 1; }

.fallback { display: grid; place-items: center; padding: 40px 20px; }
.fallback .t { margin: 0 0 6px; font-size: 15px; font-weight: 700; letter-spacing: -0.02em; }
.fallback .d { margin: 0; font-size: 13px; color: var(--text-2); line-height: 1.6; max-width: 62ch; }

/*
 * Below three-column width the fixed board stops being usable — fall back to an
 * ordinary scrolling page rather than clipping every panel.
 */
@media (max-width: 1080px) {
  .page { height: auto; min-height: 100dvh; overflow: visible; }
  .board { grid-template-columns: 1fr; }
  .cell > :deep(.card) { overflow: visible; }
  .cell.grow { flex: 0 0 auto; }
}
</style>
