import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

// PORT and BASE_PATH used to be required, and this config threw without them.
// That was a Replit-ism: Replit always injected both. Vercel's build runs with
// neither, so a hard throw here fails the build before Vite even starts.
// Both now have sane defaults - PORT only ever mattered to the local dev
// server, and the app is served from the domain root everywhere we deploy.
const port = Number(process.env.PORT ?? 24301);
const basePath = process.env.BASE_PATH ?? "/";

export default defineConfig(({ command, mode }) => {
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
          target: process.env.API_PROXY_TARGET ?? "http://localhost:8080",
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
