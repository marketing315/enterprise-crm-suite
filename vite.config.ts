import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { VitePWA } from "vite-plugin-pwa";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [
    react(),
    mode === "development" && componentTagger(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.ico", "apple-touch-icon.png", "mask-icon.svg"],
      manifest: {
        name: "CRM Gruppo Benessere",
        short_name: "CRM GB",
        description: "CRM Gruppo Benessere - Gestione clienti e vendite",
        theme_color: "#0f172a",
        background_color: "#0f172a",
        display: "standalone",
        orientation: "portrait",
        scope: "/",
        start_url: "/",
        icons: [
          {
            src: "pwa-192x192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "pwa-512x512.png",
            sizes: "512x512",
            type: "image/png",
          },
          {
            src: "pwa-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any maskable",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024, // 5 MiB
        // SECURITY: never cache Supabase API/Auth/Realtime/Storage signed URLs.
        // Caching auth/role/RLS responses leads to stale privileges after a role
        // change or signOut. Only cache public Storage assets (images served
        // from /storage/v1/object/public/*).
        navigateFallbackDenylist: [/^\/~oauth/, /^\/api\//, /^\/auth\//],
        runtimeCaching: [
          {
            // Public storage assets only (images, etc.) — safe to cache short-term
            urlPattern: ({ url }) =>
              /\.supabase\.co$/i.test(url.hostname) &&
              url.pathname.startsWith("/storage/v1/object/public/"),
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "supabase-public-assets",
              expiration: { maxEntries: 60, maxAgeSeconds: 60 * 60 }, // 1h
            },
          },
          {
            // Everything else on Supabase: NEVER cache (auth, rest, rpc,
            // realtime, signed storage URLs, edge functions)
            urlPattern: ({ url }) => /\.supabase\.co$/i.test(url.hostname),
            handler: "NetworkOnly",
          },
        ],
      },
    }),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    target: "es2020",
    rollupOptions: {
      output: {
        manualChunks: {
          "vendor-react": ["react", "react-dom", "react-router-dom"],
          "vendor-ui": [
            "@radix-ui/react-dialog",
            "@radix-ui/react-dropdown-menu",
            "@radix-ui/react-popover",
            "@radix-ui/react-tooltip",
            "@radix-ui/react-select",
            "@radix-ui/react-tabs",
          ],
          "vendor-query": ["@tanstack/react-query", "@tanstack/react-query-persist-client"],
          "vendor-charts": ["recharts"],
          "vendor-supabase": ["@supabase/supabase-js"],
          "vendor-date": ["date-fns"],
        },
      },
    },
  },
}));
