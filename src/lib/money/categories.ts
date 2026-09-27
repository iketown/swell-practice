import { z } from "zod";

export interface MoneyCategory {
  id: string;
  name: string;
  deleted: boolean;
}

export const categoryActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("create"),
    name: z.string().trim().min(1, "Enter a category name.").max(100),
  }),
  z.object({
    action: z.literal("rename"),
    id: z.string().min(1).max(1024),
    name: z.string().trim().min(1, "Enter a category name.").max(100),
  }),
  z.object({
    action: z.enum(["delete", "restore"]),
    id: z.string().min(1).max(1024),
  }),
]);
export type CategoryAction = z.infer<typeof categoryActionSchema>;

export function initialCategories(
  previousNames: string[] = [],
): MoneyCategory[] {
  const names = [
    "Gear",
    "Clothing",
    "Meals",
    "Band payments",
    "Rehearsal",
    "Video session",
    "Travel",
    "Software",
    "Marketing",
    "Other",
    ...previousNames,
  ];
  const seen = new Set<string>();
  return names.flatMap((raw) => {
    const name = raw.trim();
    if (!name || seen.has(name.toLowerCase())) return [];
    seen.add(name.toLowerCase());
    return [
      {
        id: `category-${encodeURIComponent(name.toLowerCase())}`,
        name,
        deleted: false,
      },
    ];
  });
}

// Deletion only removes a choice for future entries. Posted labels stay immutable.
export function changeCategories(
  current: MoneyCategory[],
  raw: CategoryAction,
  newId: string,
): MoneyCategory[] {
  const action = categoryActionSchema.parse(raw);
  const target =
    "id" in action ? current.find((c) => c.id === action.id) : undefined;
  if (action.action !== "create" && !target)
    throw new Error("Category not found. Refresh and try again.");
  if (action.action === "rename" && target?.deleted)
    throw new Error("Restore this category before renaming it.");
  const name = "name" in action ? action.name : target!.name;
  if (
    action.action !== "delete" &&
    current.some(
      (c) =>
        !c.deleted &&
        c.id !== target?.id &&
        c.name.toLowerCase() === name.toLowerCase(),
    )
  )
    throw new Error("A category with that name already exists.");
  if (action.action === "create") {
    if (current.length >= 500)
      throw new Error(
        "The category limit has been reached. Restore or rename an existing category.",
      );
    return [...current, { id: newId, name, deleted: false }];
  }
  if (
    action.action === "delete" &&
    current.filter((c) => !c.deleted).length === 1 &&
    !target!.deleted
  )
    throw new Error("Keep at least one category available.");
  return current.map((c) =>
    c.id === target!.id
      ? { ...c, name, deleted: action.action === "delete" }
      : c,
  );
}
