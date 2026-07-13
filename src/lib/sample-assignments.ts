import type { Band, BandMember, BandSongOverride, MemberSongDefault } from "@/lib/domain";

export const sampleMembers: BandMember[] = [
  {
    id: "member-ike",
    firstName: "Ike",
    lastName: "Turner",
    displayName: "Ike",
    slug: "ike",
    email: "ike@example.com",
    phone: "",
    notes: "Primary guitar and top harmony.",
  },
  {
    id: "member-chris",
    firstName: "Chris",
    lastName: "Morgan",
    displayName: "Chris",
    slug: "chris",
    email: "chris@example.com",
    phone: "",
    notes: "Bass and middle harmony.",
  },
  {
    id: "member-sam",
    firstName: "Sam",
    lastName: "Parker",
    displayName: "Sam",
    slug: "sam",
    email: "sam@example.com",
    phone: "",
  },
  {
    id: "member-ben",
    firstName: "Ben",
    lastName: "Foster",
    displayName: "Ben",
    slug: "ben",
    email: "ben@example.com",
    phone: "",
  },
  {
    id: "member-joe",
    firstName: "Joe",
    lastName: "Carter",
    displayName: "Joe",
    slug: "joe",
    email: "joe@example.com",
    phone: "",
  },
  {
    id: "member-chuck",
    firstName: "Chuck",
    lastName: "Bennett",
    displayName: "Chuck",
    slug: "chuck",
    email: "chuck@example.com",
    phone: "",
  },
  {
    id: "member-al",
    firstName: "Al",
    lastName: "Reed",
    displayName: "Al",
    slug: "al",
    email: "al@example.com",
    phone: "",
  },
];

export const sampleBands: Band[] = [
  {
    id: "band-a",
    title: "Band A · Standard lineup",
    code: "SWELL",
    memberIds: ["member-ike", "member-chris", "member-sam", "member-ben", "member-joe"],
  },
  {
    id: "band-b",
    title: "Band B · Chuck + Al",
    code: "SUB25",
    memberIds: ["member-ike", "member-chris", "member-sam", "member-chuck", "member-al"],
  },
];

const songIds = ["demo-california-girls", "demo-i-get-around", "demo-rhonda"];

export const sampleMemberSongDefaults: MemberSongDefault[] = songIds.flatMap((songId) => [
  { memberId: "member-ike", songId, partSlugs: ["voc_1", "guit_a"] },
  { memberId: "member-chris", songId, partSlugs: ["voc_3", "bass"] },
  { memberId: "member-sam", songId, partSlugs: ["voc_2"] },
  { memberId: "member-ben", songId, partSlugs: ["voc_4", "guit_b"] },
  { memberId: "member-joe", songId, partSlugs: ["voc_5", "keys"] },
  { memberId: "member-chuck", songId, partSlugs: ["voc_4", "guit_a"] },
  { memberId: "member-al", songId, partSlugs: ["voc_5", "keys"] },
]);

export const sampleBandSongOverrides: BandSongOverride[] = [
  {
    bandId: "band-b",
    songId: "demo-california-girls",
    memberId: "member-ike",
    partSlugs: ["voc_1", "guit_b"],
  },
];
