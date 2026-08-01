import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

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

  return {
    base: basePath,
    plugins: [react(), tailwindcss()],
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
      proxy: {
        "/api": {
          target: apiProxyTarget,
          changeOrigin: true,
        },
      },
    },
    preview: {
      port,
      host: "0.0.0.0",
      allowedHosts: true,
    },
  };
});
