import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build as esbuild } from "esbuild";
import esbuildPluginPino from "esbuild-plugin-pino";
import { rm, writeFile } from "node:fs/promises";

// Plugins (e.g. 'esbuild-plugin-pino') may use `require` to resolve dependencies
globalThis.require = createRequire(import.meta.url);

const artifactDir = path.dirname(fileURLToPath(import.meta.url));

async function buildAll() {
  const distDir = path.resolve(artifactDir, "dist");
  await rm(distDir, { recursive: true, force: true });

  // Options common to both output formats below. The two builds differ only in
  // module format, entry point, and the banner that goes with each format.
  const shared = {
    platform: "node",
    bundle: true,
    logLevel: "info",
    // Some packages may not be bundleable, so we externalize them, we can add more here as needed.
    // Some of the packages below may not be imported or installed, but we're adding them in case they are in the future.
    // Examples of unbundleable packages:
    // - uses native modules and loads them dynamically (e.g. sharp)
    // - use path traversal to read files (e.g. @google-cloud/secret-manager loads sibling .proto files)
    external: [
      "*.node",
      "sharp",
      "better-sqlite3",
      "sqlite3",
      "canvas",
      "bcrypt",
      "argon2",
      "fsevents",
      "re2",
      "farmhash",
      "xxhash-addon",
      "bufferutil",
      "utf-8-validate",
      "ssh2",
      "cpu-features",
      "dtrace-provider",
      "isolated-vm",
      "lightningcss",
      "pg-native",
      "oracledb",
      "mongodb-client-encryption",
      "nodemailer",
      "handlebars",
      "knex",
      "typeorm",
      "protobufjs",
      "onnxruntime-node",
      "@tensorflow/*",
      "@prisma/client",
      "@mikro-orm/*",
      "@grpc/*",
      "@swc/*",
      "@aws-sdk/*",
      "@azure/*",
      "@opentelemetry/*",
      "@google-cloud/*",
      "@google/*",
      "googleapis",
      "firebase-admin",
      "@parcel/watcher",
      "@sentry/profiling-node",
      "@tree-sitter/*",
      "aws-sdk",
      "classic-level",
      "dd-trace",
      "ffi-napi",
      "grpc",
      "hiredis",
      "kerberos",
      "leveldown",
      "miniflare",
      "mysql2",
      "newrelic",
      "odbc",
      "piscina",
      "realm",
      "ref-napi",
      "rocksdb",
      "sass-embedded",
      "sequelize",
      "serialport",
      "snappy",
      "tinypool",
      "usb",
      "workerd",
      "wrangler",
      "zeromq",
      "zeromq-prebuilt",
      "playwright",
      "puppeteer",
      "puppeteer-core",
      "electron",
    ],
    sourcemap: "linked",
    loader: { ".md": "text" },
    // pino relies on workers to handle logging, instead of externalizing it we use a plugin to handle it
    plugins: [esbuildPluginPino({ transports: ["pino-pretty"] })],
  };

  // ESM build: the long-running Node server (calls app.listen) - local dev and
  // any persistent host.
  await esbuild({
    ...shared,
    entryPoints: [path.resolve(artifactDir, "src/index.ts")],
    format: "esm",
    outdir: distDir,
    outExtension: { ".js": ".mjs" },
    // Make sure packages that are cjs only (e.g. express) but are bundled continue to work in our esm output file
    banner: {
      js: `import { createRequire as __bannerCrReq } from 'node:module';
import __bannerPath from 'node:path';
import __bannerUrl from 'node:url';

globalThis.require = __bannerCrReq(import.meta.url);
globalThis.__filename = __bannerUrl.fileURLToPath(import.meta.url);
globalThis.__dirname = __bannerPath.dirname(globalThis.__filename);
    `,
    },
  });

  // CommonJS build: the bare Express app (default export, no listen), imported
  // by the Vercel serverless function at /api/index.ts. Bundled
  // self-contained so the workspace deps are inlined and Vercel never has to
  // resolve the pnpm graph.
  //
  // CJS specifically, and this is the whole point of the second build. Vercel
  // compiles api/index.ts to CommonJS, and CommonJS cannot require() an ES
  // module - an .mjs bundle here dies at runtime with:
  //
  //   Error [ERR_REQUIRE_ESM]: require() of ES Module .../app.mjs
  //   from /var/task/api/index.js not supported
  //
  // A .cjs bundle works whichever way Vercel compiles the entry: CommonJS can
  // require it, and ESM can import it (Node gives CJS modules a default
  // export). No banner - `require`, `__filename` and `__dirname` are already
  // real in CommonJS.
  await esbuild({
    ...shared,
    entryPoints: [path.resolve(artifactDir, "src/app.ts")],
    format: "cjs",
    // outdir rather than outfile: the pino plugin adds its own worker entry
    // points, and esbuild rejects outfile whenever there is more than one
    // input. The .cjs extension is what makes Node treat the output as
    // CommonJS regardless of any enclosing "type": "module".
    outdir: distDir,
    outExtension: { ".js": ".cjs" },
  });

  // esbuild emits JavaScript only, but Vercel type-checks api/index.ts
  // *after* the build, and that file imports the bundle below. Without a
  // declaration next to it TypeScript rejects the import under noImplicitAny:
  //
  //   error TS7016: Could not find a declaration file for module
  //   '../artifacts/api-server/dist/app.mjs'
  //
  // This never surfaces locally - nothing on a dev machine type-checks the
  // `api/` directory - so it can only fail in a deployment. Emitting the
  // declaration here keeps it beside the bundle it describes, and correct by
  // construction: `dist/` is wiped at the start of every build, so the two can
  // never drift apart.
  await writeFile(
    path.resolve(distDir, "app.d.cts"),
    [
      "// Generated by build.mjs - do not edit. Describes the esbuild bundle",
      "// app.cjs for the Vercel serverless entry at api/index.ts.",
      'import type { Express } from "express";',
      "",
      "declare const app: Express;",
      "export default app;",
      "",
    ].join("\n"),
    "utf8",
  );
}

buildAll().catch((err) => {
  console.error(err);
  process.exit(1);
});
