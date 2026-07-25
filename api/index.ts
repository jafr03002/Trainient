// Vercel serverless entry for the entire API.
//
// The handler *is* the Express app (an Express app is itself a (req, res)
// handler). The app mounts its own routes under `/api`, and a rewrite preserves
// the original request path, so `/api/healthz` reaches the app as
// `/api/healthz` and routes correctly.
//
// This file is `index.ts`, paired with an explicit `/api/(.*) -> /api` rewrite
// in vercel.json, because that is the combination Vercel documents for putting
// a whole Express app behind one function. The obvious-looking alternative - a
// catch-all named `api/[...path].ts` with no rewrite - deployed cleanly and
// served single-segment paths like `/api/profile`, but returned Vercel's own
// NOT_FOUND page for nested ones like `/api/programs/current`, never reaching
// this app at all. That failure is invisible in the runtime logs precisely
// because the request is rejected before the function runs.
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
