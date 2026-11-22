import {
  ASSIGNMENT_STEM_PART_BY_INSTRUMENT_ID,
  DEFAULT_PARTS,
  sortPartSlugs,
  VOCAL_PART_SLUGS,
  type Band,
  type BandMember,
  type BandSongArrangement,
  type Song,
  type SongTag,
  type VocalPartSlug,
} from "@/lib/domain";

export interface MemberSongAssignmentRow {
  song: Pick<Song, "id" | "title" | "slug" | "tagIds" | "published">;
  partSlugs: string[];
}

export interface MemberAssignmentPageData {
  member: BandMember;
  bands: Band[];
  selectedBand: Band;
  tags: SongTag[];
  rows: MemberSongAssignmentRow[];
}

const STARTUP_MEMBER_ORDER = ["ike", "jackson", "joe", "sam", "cron"] as const;

function assignmentMemberIdsForBand(band: Band, members: BandMember[]) {
  const memberMap = new Map(members.map((member) => [member.id, member]));
  const usedParts = new Set<VocalPartSlug>();
  const orderedMemberIds = band.memberIds.flatMap((memberId) => {
    const vocalPart = band.vocalPartByMemberId[memberId];
    if (!memberMap.has(memberId) || !vocalPart || usedParts.has(vocalPart)) return [];
    usedParts.add(vocalPart);
    return [{ memberId, vocalPart }];
  });

  if (Object.keys(band.vocalPartByMemberId).length) {
    return orderedMemberIds
      .sort(
        (left, right) =>
          VOCAL_PART_SLUGS.indexOf(left.vocalPart)
          - VOCAL_PART_SLUGS.indexOf(right.vocalPart),
      )
      .map(({ memberId }) => memberId);
  }

  const fallbackMemberIds = band.title.trim().toLowerCase().includes("startup")
    ? [...band.memberIds].sort((leftId, rightId) => {
        const leftName = memberMap.get(leftId)?.displayName.trim().toLowerCase() ?? "";
        const rightName = memberMap.get(rightId)?.displayName.trim().toLowerCase() ?? "";
        const leftOrder = STARTUP_MEMBER_ORDER.indexOf(
          leftName as (typeof STARTUP_MEMBER_ORDER)[number],
        );
        const rightOrder = STARTUP_MEMBER_ORDER.indexOf(
          rightName as (typeof STARTUP_MEMBER_ORDER)[number],
        );
        return (leftOrder < 0 ? 99 : leftOrder) - (rightOrder < 0 ? 99 : rightOrder);
      })
    : band.memberIds;

  return fallbackMemberIds
    .filter((memberId) => memberMap.has(memberId))
    .slice(0, VOCAL_PART_SLUGS.length);
}

export function memberAssignmentPage({
  member,
  memberBands,
  selectedBand,
  members,
  songs,
  tags,
  arrangements,
}: {
  member: BandMember;
  memberBands: Band[];
  selectedBand: Band;
  members: BandMember[];
  songs: Song[];
  tags: SongTag[];
  arrangements: BandSongArrangement[];
}): MemberAssignmentPageData {
  const arrangementBySongId = new Map(
    arrangements.map((arrangement) => [arrangement.songId, arrangement]),
  );
  const assignmentMemberIds = assignmentMemberIdsForBand(selectedBand, members);
  const memberSlotIndex = assignmentMemberIds.indexOf(member.id);
  const usesConfiguredVocalParts = Boolean(
    Object.keys(selectedBand.vocalPartByMemberId).length,
  );

  const rows = songs.map((song) => {
    const arrangement = arrangementBySongId.get(song.id);
    const instrumentAssignments =
      arrangement?.instrumentAssignments ?? song.instrumentAssignments;
    const instrumentAssignment = memberSlotIndex >= 0
      ? instrumentAssignments.players[memberSlotIndex]
      : null;
    const instrumentPartSlug = typeof instrumentAssignment === "string"
      ? ASSIGNMENT_STEM_PART_BY_INSTRUMENT_ID[instrumentAssignment]
      : undefined;
    const vocalPartSlug = arrangement?.vocalAssignments === undefined
      ? selectedBand.vocalPartByMemberId[member.id]
        ?? (!usesConfiguredVocalParts && memberSlotIndex >= 0
          ? VOCAL_PART_SLUGS[memberSlotIndex]
          : undefined)
      : arrangement.vocalAssignments.find(
          (assignment) => assignment.memberId === member.id,
        )?.partSlug;

    return {
      song: { id: song.id, title: song.title, slug: song.slug, tagIds: song.tagIds, published: song.published },
      partSlugs: sortPartSlugs(
        [instrumentPartSlug, vocalPartSlug].filter(
          (partSlug): partSlug is string => Boolean(partSlug),
        ),
        DEFAULT_PARTS,
      ),
    };
  });

  return {
    member,
    bands: memberBands,
    selectedBand,
    tags,
    rows,
  };
}
