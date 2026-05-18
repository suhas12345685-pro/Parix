import { getDb, persistToFile } from "../../memory/db.js";
import type { GoalTree } from "./types.js";

export function savePlanTree(tree: GoalTree): void {
  getDb().run(
    `INSERT INTO plan_trees (id, root_goal, trigger, status, nodes_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       root_goal = excluded.root_goal,
       trigger = excluded.trigger,
       status = excluded.status,
       nodes_json = excluded.nodes_json,
       updated_at = excluded.updated_at`,
    [
      tree.id,
      tree.rootGoal,
      tree.trigger,
      tree.status,
      JSON.stringify(tree.nodes),
      new Date(tree.createdAt).toISOString(),
      new Date(tree.updatedAt).toISOString(),
    ],
  );
  persistToFile();
}

export function loadActivePlanTrees(): GoalTree[] {
  const trees: GoalTree[] = [];

  let stmt: ReturnType<ReturnType<typeof getDb>["prepare"]>;
  try {
    stmt = getDb().prepare(
      "SELECT * FROM plan_trees WHERE status IN (?, ?) ORDER BY updated_at DESC",
    );
  } catch {
    // Table missing on first run or in isolated test envs — nothing to restore.
    return trees;
  }

  try {
    stmt.bind(["active", "suspended"]);
    while (stmt.step()) {
      const cols = stmt.getColumnNames();
      const vals = stmt.get();
      const row: Record<string, unknown> = {};
      cols.forEach((column: string, index: number) => {
        row[column] = vals[index];
      });

      trees.push({
        id: String(row.id),
        rootGoal: String(row.root_goal),
        trigger: String(row.trigger),
        status: row.status as GoalTree["status"],
        nodes: JSON.parse(String(row.nodes_json)),
        createdAt: new Date(String(row.created_at)).getTime(),
        updatedAt: new Date(String(row.updated_at)).getTime(),
      });
    }
  } finally {
    stmt.free();
  }

  return trees;
}

export function removePlanTree(id: string): void {
  getDb().run("DELETE FROM plan_trees WHERE id = ?", [id]);
  persistToFile();
}
