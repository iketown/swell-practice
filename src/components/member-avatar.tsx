import Image from "next/image";

import { cn } from "@/lib/utils";

interface MemberAvatarProps {
  displayName: string;
  photoUrl?: string;
  className?: string;
}

function initials(displayName: string) {
  return displayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((name) => name[0])
    .join("")
    .toUpperCase();
}

export function MemberAvatar({ displayName, photoUrl, className }: MemberAvatarProps) {
  return (
    <span className={cn("relative inline-flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-md border border-foreground/15 bg-secondary text-xs font-semibold tracking-wide text-secondary-foreground", className)}>
      {photoUrl ? <Image src={photoUrl} alt="" fill unoptimized sizes="96px" className="object-cover" /> : initials(displayName)}
    </span>
  );
}

export function MemberThumbnail({ displayName, photoUrl, className }: MemberAvatarProps) {
  return (
    <span aria-label={displayName} title={displayName} className={cn("relative inline-flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-md border border-foreground/15 bg-secondary text-sm font-semibold tracking-wide text-secondary-foreground shadow-sm", className)}>
      {photoUrl ? <Image src={photoUrl} alt="" fill unoptimized sizes="96px" className="object-cover" /> : initials(displayName)}
      <span className="absolute inset-x-0 bottom-0 truncate bg-foreground/75 px-1 py-1 text-center text-[10px] leading-none font-semibold text-white">{displayName}</span>
    </span>
  );
}
