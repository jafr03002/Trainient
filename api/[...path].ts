// Vercel serverless entry for the entire API.
//
// Vercel routes every `/api/*` request to this catch-all function, and the
// handler *is* the Express app (an Express app is itself a (req, res) handler).
// The app mounts its own routes under `/api`, and Vercel preserves the original
// request path, so `/api/healthz` reaches the app as `/api/healthz` and routes
// correctly.
//
// We re-export the esbuild-bundled app (produced by the `vercel-build` command,
// see vercel.json) rather than importing the TypeScript source. The bundle
// inlines every dependency - including the workspace packages @workspace/db and
// @workspace/api-zod - so Vercel's function bundler never has to resolve the
// pnpm workspace graph, which is the one thing that doesn't reliably survive
// pnpm's symlinked node_modules.
//
// The bundle is CommonJS (.cjs), not ESM. Vercel compiles this file to
// CommonJS, and CommonJS cannot require() an ES module - pointing at an .mjs
// bundle builds fine and then dies on the first request with ERR_REQUIRE_ESM.
// See the CJS build in artifacts/api-server/build.mjs.
export { default } from "../artifacts/api-server/dist/app.cjs";
