"use client";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel } from "@/components/ui/field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { saveCategory } from "@/lib/money/client";
import type { CategoryAction, MoneyCategory } from "@/lib/money/categories";

export function MoneyCategoryCreate({
  demo,
  onCreated,
  id = "new-money-category",
}: {
  demo: boolean;
  onCreated: (categories: MoneyCategory[], name: string) => void;
  id?: string;
}) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function create() {
    setBusy(true);
    setError("");
    try {
      const categories = await saveCategory({ action: "create", name }, demo);
      onCreated(categories, name.trim());
      setName("");
      toast.success("Category added.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="flex flex-col gap-3">
      <Field>
        <FieldLabel htmlFor={id}>New category name</FieldLabel>
        <div className="flex flex-wrap gap-2">
          <Input
            id={id}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Clothing or Band payments"
            maxLength={100}
            disabled={busy}
            className="min-w-40 flex-1"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                if (name.trim() && !busy) void create();
              }
            }}
          />
          <Button
            type="button"
            variant="outline"
            onClick={() => void create()}
            disabled={busy || !name.trim()}
          >
            {busy ? "Adding…" : "Add category"}
          </Button>
        </div>
      </Field>
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}

export function MoneyCategories({
  categories,
  demo,
  onChanged,
  onClose,
}: {
  categories: MoneyCategory[];
  demo: boolean;
  onChanged: (categories: MoneyCategory[]) => void;
  onClose: () => void;
}) {
  const [editing, setEditing] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function update(action: CategoryAction) {
    setBusy(true);
    setError("");
    try {
      onChanged(await saveCategory(action, demo));
      setEditing("");
      toast.success(
        action.action === "delete"
          ? "Category deleted. Past transactions are unchanged."
          : "Category updated.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="swell-panel p-5 sm:p-6" aria-label="Manage categories">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-xl font-semibold">Manage categories</h2>
        <Button variant="ghost" onClick={onClose} disabled={busy}>
          Close
        </Button>
      </div>
      <p className="mb-5 max-w-prose text-sm text-muted-foreground">
        Categories organize transactions. They never create gear records.
        Renaming or deleting a category changes future choices; past
        transactions keep their original labels.
      </p>
      <MoneyCategoryCreate
        demo={demo}
        onCreated={(items) => onChanged(items)}
      />
      {error ? (
        <Alert variant="destructive" className="mt-4">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <ul className="mt-4 divide-y">
        {categories
          .filter((c) => !c.deleted)
          .map((c) => (
            <li
              key={c.id}
              className="flex flex-wrap items-center justify-between gap-3 py-3"
            >
              {editing === c.id ? (
                <>
                  <Field className="min-w-40 flex-1">
                    <FieldLabel
                      htmlFor={`category-${c.id}`}
                      className="sr-only"
                    >
                      Rename {c.name}
                    </FieldLabel>
                    <Input
                      id={`category-${c.id}`}
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      maxLength={100}
                      disabled={busy}
                    />
                  </Field>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() =>
                        void update({ action: "rename", id: c.id, name })
                      }
                      disabled={busy || !name.trim()}
                    >
                      Save
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setEditing("")}
                      disabled={busy}
                    >
                      Cancel
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <span className="min-w-0 break-words font-medium">
                    {c.name}
                  </span>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setEditing(c.id);
                        setName(c.name);
                      }}
                      disabled={busy}
                      aria-label={`Rename ${c.name}`}
                    >
                      Rename
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        void update({ action: "delete", id: c.id })
                      }
                      disabled={busy}
                      aria-label={`Delete ${c.name}`}
                    >
                      Delete
                    </Button>
                  </div>
                </>
              )}
            </li>
          ))}
      </ul>
      {categories.some((c) => c.deleted) ? (
        <details className="mt-4">
          <summary className="cursor-pointer text-sm font-medium">
            Deleted categories
          </summary>
          <ul className="mt-2 divide-y">
            {categories
              .filter((c) => c.deleted)
              .map((c) => (
                <li
                  key={c.id}
                  className="flex items-center justify-between gap-3 py-2"
                >
                  <span className="min-w-0 break-words text-sm text-muted-foreground">
                    {c.name}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void update({ action: "restore", id: c.id })}
                    disabled={busy}
                    aria-label={`Restore ${c.name}`}
                  >
                    Restore
                  </Button>
                </li>
              ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}
