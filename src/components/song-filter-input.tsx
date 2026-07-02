"use client";

import { SearchIcon, XIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { Song } from "@/lib/domain";
import { cn } from "@/lib/utils";

interface SongFilterInputProps {
  id: string;
  songs: Song[];
  value: string;
  onChange: (value: string) => void;
  matchCount?: number;
  className?: string;
}

export function SongFilterInput({ id, songs, value, onChange, matchCount, className }: SongFilterInputProps) {
  const listId = `${id}-suggestions`;
  const trimmedValue = value.trim();

  return (
    <Field className={cn("max-w-md", className)}>
      <FieldLabel htmlFor={id}>Search songs</FieldLabel>
      <div className="relative">
        <SearchIcon aria-hidden className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          id={id}
          type="search"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="search"
          list={listId}
          autoComplete="off"
          className="h-10 pr-10 pl-8"
        />
        {trimmedValue ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Clear song search"
            className="absolute top-1/2 right-1 -translate-y-1/2"
            onClick={() => onChange("")}
          >
            <XIcon aria-hidden />
          </Button>
        ) : null}
      </div>
      <datalist id={listId}>
        {songs.map((song) => (
          <option key={song.id} value={song.title} />
        ))}
      </datalist>
      {trimmedValue && matchCount !== undefined ? (
        <FieldDescription>{`${matchCount} matching ${matchCount === 1 ? "song" : "songs"}.`}</FieldDescription>
      ) : null}
    </Field>
  );
}
