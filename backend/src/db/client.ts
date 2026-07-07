import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import { PGlite } from "@electric-sql/pglite";
import postgres from "postgres";
import { env, isLocalDb } from "../env.js";
import { SCHEMA_DDL } from "./ddl.js";
import * as schema from "./schema.js";

export type Db = ReturnType<typeof drizzlePglite<typeof schema>> &
  ReturnType<typeof drizzlePostgres<typeof schema>>;

export interface DbHandle {
  db: Db;
  /** Create all tables if absent. Safe to call repeatedly. */
  initSchema(): Promise<void>;
  close(): Promise<void>;
}

/** Production/dev handle chosen by whether DATABASE_URL is set. */
export function createDbHandle(): DbHandle {
  if (isLocalDb) {
    const client = new PGlite(); // in-memory
    const db = drizzlePglite(client, { schema }) as unknown as Db;
    return {
      db,
      async initSchema() {
        await client.exec(SCHEMA_DDL);
      },
      async close() {
        await client.close();
      },
    };
  }

  const client = postgres(env.DATABASE_URL, { max: 10 });
  const db = drizzlePostgres(client, { schema }) as unknown as Db;
  return {
    db,
    async initSchema() {
      await client.unsafe(SCHEMA_DDL);
    },
    async close() {
      await client.end();
    },
  };
}

/** A fresh, isolated in-memory PGlite database with the schema applied — for tests. */
export async function createTestDb(): Promise<DbHandle> {
  const client = new PGlite();
  const db = drizzlePglite(client, { schema }) as unknown as Db;
  await client.exec(SCHEMA_DDL);
  return {
    db,
    async initSchema() {
      await client.exec(SCHEMA_DDL);
    },
    async close() {
      await client.close();
    },
  };
}
