"use client";

import { PencilIcon, PlusIcon, TagsIcon, XIcon } from "lucide-react";
import { FormEvent, useId, useMemo, useState } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxItem,
  ComboboxList,
  ComboboxValue,
  useComboboxAnchor,
} from "@/components/ui/combobox";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { Song, SongTag } from "@/lib/domain";

export function SongTagManager({
  songs,
  tags,
  onCreate,
  onDelete,
  onRename,
}: {
  songs: Song[];
  tags: SongTag[];
  onCreate: (label: string) => Promise<void>;
  onDelete: (tag: SongTag) => Promise<void>;
  onRename: (tag: SongTag, label: string) => Promise<void>;
}) {
  const newTagInputId = useId();
  const [newLabel, setNewLabel] = useState("");
  const [editingTagId, setEditingTagId] = useState<string | null>(null);
  const [editingLabel, setEditingLabel] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<SongTag | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);

  const deleteAssignmentCount = deleteTarget
    ? songs.filter((song) => song.tagIds.includes(deleteTarget.id)).length
    : 0;
  const editingTag = tags.find((tag) => tag.id === editingTagId) ?? null;

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!newLabel.trim() || busyAction) return;
    setBusyAction("create");
    try {
      await onCreate(newLabel);
      setNewLabel("");
    } finally {
      setBusyAction(null);
    }
  }

  async function handleRename(event: FormEvent<HTMLFormElement>, tag: SongTag) {
    event.preventDefault();
    if (!editingLabel.trim() || busyAction) return;
    setBusyAction(`rename-${tag.id}`);
    try {
      await onRename(tag, editingLabel);
      setEditingTagId(null);
      setEditingLabel("");
    } finally {
      setBusyAction(null);
    }
  }

  async function handleDelete() {
    if (!deleteTarget || busyAction) return;
    setBusyAction(`delete-${deleteTarget.id}`);
    try {
      await onDelete(deleteTarget);
      setDeleteTarget(null);
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <section aria-labelledby="song-tag-manager-title" className="flex flex-col gap-3 rounded-lg bg-muted/45 p-3">
      <div className="flex items-start gap-2">
        <TagsIcon aria-hidden />
        <div>
          <h2 id="song-tag-manager-title" className="text-sm font-semibold">Song tags</h2>
          <p className="text-xs text-muted-foreground">Create tags here, then assign any number to each song.</p>
        </div>
      </div>

      <form onSubmit={handleCreate}>
        <FieldGroup className="gap-2 sm:flex-row sm:items-end">
          <Field className="max-w-sm">
            <FieldLabel htmlFor={newTagInputId}>New tag</FieldLabel>
            <Input
              id={newTagInputId}
              maxLength={40}
              onChange={(event) => setNewLabel(event.target.value)}
              placeholder="e.g. Holiday set"
              value={newLabel}
            />
          </Field>
          <Button disabled={!newLabel.trim() || Boolean(busyAction)} size="sm" type="submit">
            <PlusIcon data-icon="inline-start" />
            {busyAction === "create" ? "Adding" : "Add tag"}
          </Button>
        </FieldGroup>
      </form>

      {tags.length ? (
        <div className="flex flex-wrap gap-2" aria-label="Available song tags">
          {tags.map((tag) => (
            <span key={tag.id} className="flex items-center gap-0.5">
              <Badge
                render={(
                  <button
                    aria-label={`Rename ${tag.label}`}
                    aria-pressed={editingTagId === tag.id}
                    onClick={() => {
                      setEditingTagId(tag.id);
                      setEditingLabel(tag.label);
                    }}
                    type="button"
                  />
                )}
                variant="secondary"
              >
                {tag.label}
                <PencilIcon aria-hidden />
              </Badge>
              <Button
                aria-label={`Delete ${tag.label}`}
                disabled={Boolean(busyAction)}
                onClick={() => setDeleteTarget(tag)}
                size="icon-xs"
                type="button"
                variant="ghost"
              >
                <XIcon />
              </Button>
            </span>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No tags yet. Add the first one above.</p>
      )}

      {editingTag ? (
        <form onSubmit={(event) => void handleRename(event, editingTag)}>
          <FieldGroup className="gap-2 sm:max-w-lg sm:flex-row sm:items-end">
            <Field>
              <FieldLabel htmlFor={`rename-song-tag-${editingTag.id}`}>Rename {editingTag.label}</FieldLabel>
              <Input
                autoFocus
                id={`rename-song-tag-${editingTag.id}`}
                maxLength={40}
                onChange={(event) => setEditingLabel(event.target.value)}
                value={editingLabel}
              />
            </Field>
            <div className="flex items-center gap-1">
              <Button disabled={!editingLabel.trim() || Boolean(busyAction)} size="sm" type="submit">
                {busyAction === `rename-${editingTag.id}` ? "Saving" : "Save"}
              </Button>
              <Button
                disabled={Boolean(busyAction)}
                onClick={() => {
                  setEditingTagId(null);
                  setEditingLabel("");
                }}
                size="sm"
                type="button"
                variant="ghost"
              >
                Cancel
              </Button>
            </div>
          </FieldGroup>
        </form>
      ) : null}

      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && !busyAction && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{deleteTarget?.label}”?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteAssignmentCount
                ? `This removes the tag from ${deleteAssignmentCount} ${deleteAssignmentCount === 1 ? "song" : "songs"}. The songs are not deleted.`
                : "This tag is not assigned to any songs."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={Boolean(busyAction)}>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={Boolean(busyAction)} onClick={() => void handleDelete()} variant="destructive">
              {busyAction?.startsWith("delete-") ? "Deleting" : "Delete tag"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

export function SongTagAssignmentField({
  disabled,
  onChange,
  song,
  tags,
}: {
  disabled?: boolean;
  onChange: (tagIds: string[]) => Promise<void>;
  song: Song;
  tags: SongTag[];
}) {
  const inputId = `song-tags-${song.id}`;
  const anchor = useComboboxAnchor();
  const [saving, setSaving] = useState(false);
  const tagLabelById = useMemo(
    () => new Map(tags.map((tag) => [tag.id, tag.label])),
    [tags],
  );
  const tagIds = tags.map((tag) => tag.id);

  async function handleChange(nextTagIds: string[]) {
    if (saving) return;
    setSaving(true);
    try {
      await onChange(nextTagIds);
    } catch {
      // The parent restores the previous selection and reports the error.
    } finally {
      setSaving(false);
    }
  }

  return (
    <Field>
      <FieldLabel htmlFor={inputId}>Tags</FieldLabel>
      <Combobox
        autoHighlight
        disabled={disabled || saving || !tags.length}
        items={tagIds}
        multiple
        onValueChange={(value) => void handleChange(value)}
        value={song.tagIds}
      >
        <ComboboxChips ref={anchor}>
          <ComboboxValue>
            {(values) => (
              <>
                {values.map((tagId: string) => (
                  <ComboboxChip key={tagId} removeLabel={`Remove ${tagLabelById.get(tagId) ?? "tag"}`}>
                    {tagLabelById.get(tagId) ?? "Unknown tag"}
                  </ComboboxChip>
                ))}
                <ComboboxChipsInput
                  aria-label={`Add tags to ${song.title}`}
                  disabled={disabled || saving || !tags.length}
                  id={inputId}
                  placeholder={values.length ? "" : tags.length ? "Add tags" : "Create a tag above"}
                />
              </>
            )}
          </ComboboxValue>
        </ComboboxChips>
        <ComboboxContent anchor={anchor}>
          <ComboboxEmpty>No matching tags.</ComboboxEmpty>
          <ComboboxList>
            {(tagId) => (
              <ComboboxItem key={tagId} value={tagId}>
                {tagLabelById.get(tagId)}
              </ComboboxItem>
            )}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
      <FieldDescription aria-live="polite">
        {saving ? "Saving tags…" : "Choose one or more."}
      </FieldDescription>
    </Field>
  );
}

export function SongTagBadges({ tagIds, tags }: { tagIds: string[]; tags: SongTag[] }) {
  const tagById = new Map(tags.map((tag) => [tag.id, tag]));
  const assignedTags = tagIds.flatMap((tagId) => {
    const tag = tagById.get(tagId);
    return tag ? [tag] : [];
  });

  if (!assignedTags.length) return null;

  return (
    <div className="flex flex-wrap gap-1.5" aria-label="Song tags">
      {assignedTags.map((tag) => <Badge key={tag.id} variant="secondary">{tag.label}</Badge>)}
    </div>
  );
}
