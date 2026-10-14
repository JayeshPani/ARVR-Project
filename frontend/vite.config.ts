import { defineConfig } from "vite";
import basicSsl from "@vitejs/plugin-basic-ssl";

/**
 * HTTPS is required for camera access (getUserMedia) from a phone on the
 * LAN, since only localhost itself counts as a secure context without it.
 * basicSsl generates and caches a self-signed cert automatically — mobile
 * Safari will show a "not private" warning once; that's expected for local
 * device testing and is not used for the eventual real deployment.
 */
export default defineConfig({
  // VITE_NO_HTTPS=1 skips the self-signed cert for local debugging in
  // tooling that refuses self-signed certs outright — the real phone/AR
  // test flow always goes through the default HTTPS path.
  plugins: process.env.VITE_NO_HTTPS ? [] : [basicSsl()],
  // Keep SDK worker URLs in Vite's module graph instead of prebundling them.
  optimizeDeps: { exclude: ["@zappar/zappar", "@zappar/zappar-cv"], include: ["ua-parser-js", "gl-matrix"] },
  server: {
    host: true,
  },
});
