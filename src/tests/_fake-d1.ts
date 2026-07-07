// A scriptable D1 stand-in for the Club section's own tests (Task 4 onward): `first()` and
// `all()` answer from a SQL-substring-keyed map, `run()` and `batch()` resolve and record, so a
// module's real prepared-statement calls execute against fixed data with no live database. Mirrors
// the same shape cairn-cms's own `fakeD1` (src/tests/unit/cairn-admin-actions.test.ts) uses for its
// auth-store tests, since this site's Club screens are the first consumer of a real D1 binding of
// their own.
import type { D1Database } from '@cloudflare/workers-types';

/** A canned response, or a function of the call's bound args, for a query whose result must
 *  vary within one test even though its SQL text matches the same substring key (a `... WHERE
 *  email = ?1` a module queries twice, for two different emails, in one scenario). */
type Responder<T> = T | ((args: unknown[]) => T);

interface FakeD1Options {
  /** Rows `.all()` returns, keyed by a SQL substring match (first match wins). */
  allResults?: Record<string, Responder<unknown[]>>;
  /** The single row `.first()` returns, keyed by a SQL substring match. */
  firstResults?: Record<string, Responder<unknown>>;
}

/** One recorded prepared-statement call: the SQL text and its bound arguments, in bind order. */
export interface FakeD1Call {
  sql: string;
  args: unknown[];
}

function matchingResult<T>(sql: string, table: Record<string, Responder<T>> | undefined, args: unknown[], fallback: T): T {
  const key = Object.keys(table ?? {}).find((candidate) => sql.includes(candidate));
  if (key === undefined) return fallback;
  const value = (table as Record<string, Responder<T>>)[key];
  return typeof value === 'function' ? (value as (args: unknown[]) => T)(args) : value;
}

/** Build a fake `D1Database` plus the ordered list of calls it recorded, so a test can both drive
 *  the module under test and assert what it sent to the database. */
export function fakeD1(opts: FakeD1Options = {}) {
  const calls: FakeD1Call[] = [];

  function statement(sql: string) {
    const stmt = {
      sql,
      args: [] as unknown[],
      bind(...args: unknown[]) {
        stmt.args = args;
        return stmt;
      },
      async first<T>() {
        calls.push({ sql, args: stmt.args });
        return matchingResult<T | null>(
          sql,
          opts.firstResults as Record<string, Responder<T | null>> | undefined,
          stmt.args,
          null,
        );
      },
      async run() {
        calls.push({ sql, args: stmt.args });
        return { results: [], success: true, meta: { changes: 1 } };
      },
      async all<T>() {
        calls.push({ sql, args: stmt.args });
        return {
          results: matchingResult<T[]>(sql, opts.allResults as Record<string, Responder<T[]>> | undefined, stmt.args, []),
          success: true,
          meta: {},
        };
      },
    };
    return stmt;
  }

  const db = {
    prepare: statement,
    async batch(stmts: ReturnType<typeof statement>[]) {
      for (const stmt of stmts) calls.push({ sql: stmt.sql, args: stmt.args });
      return stmts.map(() => ({ results: [], success: true, meta: {} }));
    },
  };

  return { db: db as unknown as D1Database, calls };
}
