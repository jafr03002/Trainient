import { defineConfig } from "drizzle-kit";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL, ensure the database is provisioned");
}

export default defineConfig({
  // The schema index, NOT a glob over the directory. Two files in there
  // (conversations.ts, messages.ts) are dead code the index never exports and
  // nothing reads; the old `./src/schema/*.ts` glob picked them up anyway, so
  // `push` created the tables. Pointing at the index keeps the migration
  // history equal to the schema the app actually uses. Existing databases keep
  // those two tables - nothing here drops them.
  schema: "./src/schema/index.ts",
  // Migrations are the deployment path now (see DEPLOY.md). `push` remains for
  // throwaway local databases only: it diffs against the live database, so
  // against a deployed one it will offer to drop whatever isn't in the schema.
  out: "./migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
});
