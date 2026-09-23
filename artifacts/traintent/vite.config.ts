import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "path";
import { hex, voltageCss } from "./src/theme/tokens";

// Writes the Voltage tokens (src/theme/tokens.ts) into src/index.css at the
// marker, so the CSS custom properties and every other consumer of the palette
// read one source. Runs before Tailwind (both are `pre`; array order decides),
// which then sees ordinary hand-written-looking CSS. Editing tokens.ts restarts
// the dev server, since it is imported by this config.
const TOKENS_MARKER = "/* @voltage-tokens */";
function voltageTokens(): Plugin {
  return {
    name: "traintent:voltage-tokens",
    enforce: "pre",
    transform(code, id) {
      if (!id.split("?")[0].endsWith("/src/index.css")) return;
      if (!code.includes(TOKENS_MARKER)) {
        // Fail loudly: without the tokens every colour in the app is unset.
        this.error(`src/index.css lost its ${TOKENS_MARKER} marker - the Voltage tokens have nowhere to go.`);
      }
      return { code: code.replace(TOKENS_MARKER, voltageCss()), map: null };
    },
    transformIndexHtml() {
      return [{ tag: "meta", attrs: { name: "theme-color", content: hex("background") }, injectTo: "head" }];
    },
  };
}

export default defineConfig(({ command, mode }) => {
  // The dev-only settings below are read with an empty prefix so they come from
  // artifacts/traintent/.env as well as the real environment. Vite's own env
  // handling stops at VITE_*, so without this a PORT or API_PROXY_TARGET written
  // into .env is simply ignored - and the proxy quietly falls back to :8080,
  // which on a machine running more than one checkout is somebody else's API
  // server. Saves then go to a bundle built from another branch, whose request
  // validators drop every field that branch doesn't know about, silently, with
  // a 200 back. Nothing here is passed to `define`, so none of it is inlined
  // into the bundle - these values only configure the local server.
  const localEnv = loadEnv(mode, import.meta.dirname, "");

  // PORT and BASE_PATH used to be required, and this config threw without them.
  // That was a Replit-ism: Replit always injected both. Vercel's build runs with
  // neither, so a hard throw here fails the build before Vite even starts.
  // Both now have sane defaults - PORT only ever mattered to the local dev
  // server, and the app is served from the domain root everywhere we deploy.
  const port = Number(localEnv.PORT || 24301);
  const basePath = localEnv.BASE_PATH || "/";
  const apiProxyTarget = localEnv.API_PROXY_TARGET || "http://localhost:8080";

  // Say out loud which API this dev server talks to. Proxying to the wrong one
  // fails silently - the app loads, requests return 200, and only the saved data
  // is wrong - so the target is worth one line at startup.
  if (command === "serve") {
    console.log(`\n[traintent] dev server :${port} -> API at ${apiProxyTarget}\n`);
  }

  // Vite inlines VITE_* at build time, so a missing key can't be fixed by
  // setting the variable afterwards - it's baked into the bundle. Without this
  // gate the build still *succeeds* and the app throws at module scope in
  // src/App.tsx, which reaches the user as a blank white page. Failing the
  // build here turns that into an obvious, readable deploy error instead.
  //
  // loadEnv reads the .env files *and* merges matching process.env keys, so it
  // covers both local development and Vercel's injected environment.
  if (command === "build") {
    const env = loadEnv(mode, import.meta.dirname, "VITE_");
    const clerkKey = env.VITE_CLERK_PUBLISHABLE_KEY;

    if (!clerkKey) {
      throw new Error(
        "VITE_CLERK_PUBLISHABLE_KEY is not set, so this build would ship an " +
          "app that renders a blank page. Set it (Clerk Dashboard -> API Keys, " +
          "the 'pk_...' publishable key) in the Vercel project's environment " +
          "variables, or in artifacts/traintent/.env for a local build, then " +
          "redeploy - changing it in Vercel only takes effect on a new build.",
      );
    }

    // Not fatal: only Clerk can say whether a key is truly valid, and hard-
    // failing on a shape we merely don't recognise would be worse than a
    // warning. But a value that isn't a publishable key at all - a secret key
    // pasted by mistake, most likely - is worth shouting about.
    if (!clerkKey.startsWith("pk_")) {
      console.warn(
        `\n[traintent] WARNING: VITE_CLERK_PUBLISHABLE_KEY does not start with "pk_". ` +
          `Clerk publishable keys look like "pk_test_..." or "pk_live_...". ` +
          `Note this value is inlined into the public bundle - never put a "sk_" secret key here.\n`,
      );
    }
  }

  // The react-query cache is persisted to localStorage (src/App.tsx). Restoring
  // a cache written against an older API contract could hand a page data in a
  // shape it no longer expects, so the persisted cache is keyed to the contract
  // itself: it's discarded exactly when openapi.yaml changes, and survives
  // every other deploy - including the one that updates the service worker the
  // night before a session in a gym with no signal.
  const apiSpec = readFileSync(path.resolve(import.meta.dirname, "..", "..", "lib", "api-spec", "openapi.yaml"));
  const queryCacheBuster = createHash("sha256").update(apiSpec).digest("hex").slice(0, 12);

  const apiProxy = {
    "/api": {
      target: apiProxyTarget,
      changeOrigin: true,
    },
  };

  return {
    base: basePath,
    define: {
      __QUERY_CACHE_BUSTER__: JSON.stringify(queryCacheBuster),
    },
    plugins: [
      voltageTokens(),
      react(),
      tailwindcss(),
      VitePWA({
        // Installs the new service worker as soon as it's downloaded, but the
        // plain registration script never reloads the page - an update lands on
        // the next launch, not mid-set.
        registerType: "autoUpdate",
        injectRegister: "script-defer",
        includeAssets: ["favicon.svg", "apple-touch-icon.png"],
        manifest: {
          id: basePath,
          name: "Trainient",
          short_name: "Trainient",
          description: "Trainient - train with intent. AI coaching and manual training tools for serious lifters.",
          start_url: basePath,
          scope: basePath,
          display: "standalone",
          theme_color: hex("background"),
          background_color: hex("background"),
          icons: [
            { src: "pwa-192x192.png", sizes: "192x192", type: "image/png", purpose: "any" },
            { src: "pwa-512x512.png", sizes: "512x512", type: "image/png", purpose: "any" },
            { src: "pwa-maskable-192x192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
            { src: "pwa-maskable-512x512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
          ],
        },
        workbox: {
          // The app shell: every built asset, so a cold start with no network
          // still renders. API responses are deliberately NOT cached here - the
          // react-query persister owns last-known data, and it is wiped when the
          // signed-in user changes; a service-worker cache would not be.
          globPatterns: ["**/*.{js,css,html,svg,png,webmanifest,woff2}"],
          maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
          navigateFallback: `${basePath}index.html`,
          navigateFallbackDenylist: [/^\/api\//],
          cleanupOutdatedCaches: true,
          runtimeCaching: [
            {
              urlPattern: ({ url }) => url.origin === "https://fonts.googleapis.com",
              handler: "StaleWhileRevalidate",
              options: { cacheName: "google-fonts-css" },
            },
            {
              urlPattern: ({ url }) => url.origin === "https://fonts.gstatic.com",
              handler: "CacheFirst",
              options: {
                cacheName: "google-fonts",
                expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
            {
              // Clerk's browser bundle, loaded from Clerk's CDN at startup. Public
              // code only - Clerk's session API (/v1/*) is never cached.
              urlPattern: ({ url }) => url.pathname.includes("/npm/@clerk/") && url.pathname.endsWith(".js"),
              handler: "StaleWhileRevalidate",
              options: {
                cacheName: "clerk-js",
                expiration: { maxEntries: 40 },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
          ],
        },
      }),
    ],
    resolve: {
      alias: {
        "@": path.resolve(import.meta.dirname, "src"),
        "@assets": path.resolve(import.meta.dirname, "..", "..", "attached_assets"),
      },
      dedupe: ["react", "react-dom"],
    },
    root: path.resolve(import.meta.dirname),
    build: {
      outDir: path.resolve(import.meta.dirname, "dist/public"),
      emptyOutDir: true,
    },
    server: {
      port,
      strictPort: true,
      host: "0.0.0.0",
      allowedHosts: true,
      fs: {
        strict: true,
      },
      // Local dev only: forward API calls to the Express server running
      // separately. In deployment the API is served from the same origin, so no
      // proxying is involved.
      proxy: apiProxy,
    },
    // Same proxy for `vite preview`, the only local way to run the production
    // build - and with it the service worker, which the dev server never serves.
    preview: {
      port,
      strictPort: true,
      host: "0.0.0.0",
      allowedHosts: true,
      proxy: apiProxy,
    },
  };
});
