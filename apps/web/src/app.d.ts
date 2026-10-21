/// <reference types="vite/client" />

import type { PanelPreferences } from '$lib/state/panels.svelte';

// See https://svelte.dev/docs/kit/types#app.d.ts
declare global {
  namespace App {
    // interface Error {}
    interface Locals {
      /**
       * The state of the panels — the navigation, the inspector and the
       * root picker.
       *
       * The `handle` hook reads it from the cookie of the visitor, so the
       * first paint is already the state the reader left behind.
       */
      panels: PanelPreferences;
    }
    // interface PageData {}
    // interface Platform {}
  }
}

export {};
