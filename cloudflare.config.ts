import { bindings, defineConfig, exports } from "cf/config";

export default defineConfig({
  worker: {
    name: "liveslides",
    entrypoint: "./worker/index.ts",
    compatibilityDate: "2026-09-30",
    assets: {
      notFoundHandling: "single-page-application",
      runWorkerFirst: ["/api/*"],
    },
    observability: {
      enabled: true,
      issues: { enabled: true },
      logs: { enabled: true },
      traces: { enabled: true },
    },
    placement: {
      mode: "smart",
    },
    env: {
      ASSETS: bindings.assets(),
      ROOMS: bindings.durableObject({ worker: "liveslides", exportName: "SlideRoom" }),
      SLIDES: bindings.r2({ name: "liveslides-slides" }),
    },
    // cf provisions the SQLite namespace and tracks its lifecycle; no Wrangler migrations.
    exports: { SlideRoom: exports.durableObject({ storage: "sqlite" }) },
  },
});
