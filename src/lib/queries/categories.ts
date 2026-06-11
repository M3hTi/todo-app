import type { Category } from "@/types";
import { getDb, withDb } from "@/lib/db";

interface CategoryRow {
  id: string;
  name: string;
  color: string;
  created_at: string;
  updated_at: string;
}

function mapCategory(row: CategoryRow): Category {
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function getAllCategories(): Promise<Category[]> {
  return withDb("getAllCategories", async () => {
    const rows = await getDb().select<CategoryRow[]>(
      "SELECT id, name, color, created_at, updated_at FROM categories ORDER BY name COLLATE NOCASE",
    );
    return rows.map(mapCategory);
  });
}

export async function createCategory(name: string, color: string): Promise<Category> {
  return withDb("createCategory", async () => {
    const now = new Date().toISOString();
    const category: Category = {
      id: crypto.randomUUID(),
      name,
      color,
      createdAt: now,
      updatedAt: now,
    };
    await getDb().execute(
      "INSERT INTO categories (id, name, color, created_at, updated_at) VALUES ($1, $2, $3, $4, $5)",
      [category.id, category.name, category.color, now, now],
    );
    return category;
  });
}

export async function updateCategory(
  id: string,
  patch: Partial<Pick<Category, "name" | "color">>,
): Promise<void> {
  return withDb("updateCategory", async () => {
    const sets: string[] = [];
    const values: unknown[] = [];
    let index = 1;

    if (patch.name !== undefined) {
      sets.push(`name = $${index++}`);
      values.push(patch.name);
    }
    if (patch.color !== undefined) {
      sets.push(`color = $${index++}`);
      values.push(patch.color);
    }
    if (sets.length === 0) return;

    sets.push(`updated_at = $${index++}`);
    values.push(new Date().toISOString());
    values.push(id);

    await getDb().execute(`UPDATE categories SET ${sets.join(", ")} WHERE id = $${index}`, values);
  });
}

/** Tasks in the category are detached (category_id set NULL by FK) before deletion. */
export async function deleteCategory(id: string): Promise<void> {
  return withDb("deleteCategory", async () => {
    await getDb().execute("DELETE FROM categories WHERE id = $1", [id]);
  });
}
