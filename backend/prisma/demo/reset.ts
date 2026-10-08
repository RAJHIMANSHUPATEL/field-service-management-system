import pg from "pg";

// Removes one organization and everything that belongs to it, children before parents, by
// walking the live foreign-key graph. Rows of other organizations are never touched.
export async function deleteOrganization(databaseUrl: string, organizationId: string) {
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const { rows: tables } = await client.query<{ table: string; hasOrg: boolean }>(`
      SELECT c.relname AS table,
             EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid = c.oid AND a.attname = 'organizationId' AND NOT a.attisdropped) AS "hasOrg"
      FROM pg_class c
      WHERE c.relkind = 'r' AND c.relnamespace = 'public'::regnamespace AND c.relname <> '_prisma_migrations'`);
    const { rows: keys } = await client.query<{ child: string; parent: string; column: string }>(`
      SELECT tc.relname AS child, pc.relname AS parent, a.attname AS column
      FROM pg_constraint k
      JOIN pg_class tc ON tc.oid = k.conrelid
      JOIN pg_class pc ON pc.oid = k.confrelid
      JOIN pg_attribute a ON a.attrelid = k.conrelid AND a.attnum = k.conkey[1]
      WHERE k.contype = 'f' AND tc.relnamespace = 'public'::regnamespace`);

    const hasOrg = new Map(tables.map((row) => [row.table, row.hasOrg]));
    const ownership = new Map<string, string>();
    const owned = (table: string, seen = new Set<string>()): string | null => {
      if (ownership.has(table)) return ownership.get(table)!;
      if (table === "Organization") return `"id" = $1`;
      if (hasOrg.get(table)) return `"organizationId" = $1`;
      if (seen.has(table)) return null;
      seen.add(table);
      const clauses = keys
        .filter((key) => key.child === table && key.parent !== table)
        .map((key) => {
          const parent = owned(key.parent, seen);
          return parent ? `"${key.column}" IN (SELECT "id" FROM "${key.parent}" WHERE ${parent})` : null;
        })
        .filter((clause): clause is string => clause !== null);
      const predicate = clauses.length ? clauses.join(" OR ") : null;
      if (predicate) ownership.set(table, predicate);
      return predicate;
    };

    // Delete leaves first: a table goes once every table referencing it has gone.
    const remaining = new Set(tables.map((row) => row.table).filter((table) => owned(table) !== null));
    remaining.add("Organization");
    await client.query("BEGIN");
    while (remaining.size > 0) {
      const ready = [...remaining].filter(
        (table) => !keys.some((key) => key.parent === table && key.child !== table && remaining.has(key.child)),
      );
      if (ready.length === 0) throw new Error(`Cannot order deletes for: ${[...remaining].join(", ")}`);
      for (const table of ready) {
        await client.query(`DELETE FROM "${table}" WHERE ${owned(table)}`, [organizationId]);
        remaining.delete(table);
      }
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}
