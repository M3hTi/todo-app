import type { Tag } from "@/types";
import { getDb, withDb } from "@/lib/db";

interface TagRow {
  id: string;
  name: string;
  created_at: string;
}

function mapTag(row: TagRow): Tag {
  return { id: row.id, name: row.name, createdAt: row.created_at };
}

export async function getAllTags(): Promise<Tag[]> {
  return withDb("getAllTags", async () => {
    const rows = await getDb().select<TagRow[]>(
      "SELECT id, name, created_at FROM tags ORDER BY name COLLATE NOCASE",
    );
    return rows.map(mapTag);
  });
}

/**
 * Replaces a task's tag set with the given names: creates missing tags,
 * rewrites the task_tags links, then prunes tags no task references.
 */
export async function setTagsForTask(taskId: string, tagNames: string[]): Promise<Tag[]> {
  return withDb("setTagsForTask", async () => {
    const db = getDb();
    const unique = [...new Set(tagNames.map((name) => name.trim()).filter(Boolean))];

    const tags: Tag[] = [];
    for (const name of unique) {
      const existing = await db.select<TagRow[]>(
        "SELECT id, name, created_at FROM tags WHERE name = $1",
        [name],
      );
      if (existing.length > 0 && existing[0]) {
        tags.push(mapTag(existing[0]));
      } else {
        const tag: Tag = { id: crypto.randomUUID(), name, createdAt: new Date().toISOString() };
        await db.execute("INSERT INTO tags (id, name, created_at) VALUES ($1, $2, $3)", [
          tag.id,
          tag.name,
          tag.createdAt,
        ]);
        tags.push(tag);
      }
    }

    await db.execute("DELETE FROM task_tags WHERE task_id = $1", [taskId]);
    for (const tag of tags) {
      await db.execute("INSERT INTO task_tags (task_id, tag_id) VALUES ($1, $2)", [
        taskId,
        tag.id,
      ]);
    }

    await deleteUnusedTags();
    return tags;
  });
}

/** Creates a tag by name, or returns the existing one with that name. */
export async function createTag(name: string): Promise<Tag> {
  return withDb("createTag", async () => {
    const db = getDb();
    const trimmed = name.trim();
    const existing = await db.select<TagRow[]>(
      "SELECT id, name, created_at FROM tags WHERE name = $1",
      [trimmed],
    );
    if (existing.length > 0 && existing[0]) return mapTag(existing[0]);

    const tag: Tag = { id: crypto.randomUUID(), name: trimmed, createdAt: new Date().toISOString() };
    await db.execute("INSERT INTO tags (id, name, created_at) VALUES ($1, $2, $3)", [
      tag.id,
      tag.name,
      tag.createdAt,
    ]);
    return tag;
  });
}

/** Deletes a tag everywhere; task_tags links cascade via FK. */
export async function deleteTag(id: string): Promise<void> {
  return withDb("deleteTag", async () => {
    await getDb().execute("DELETE FROM tags WHERE id = $1", [id]);
  });
}

export async function deleteUnusedTags(): Promise<void> {
  return withDb("deleteUnusedTags", async () => {
    await getDb().execute(
      "DELETE FROM tags WHERE id NOT IN (SELECT DISTINCT tag_id FROM task_tags)",
    );
  });
}
