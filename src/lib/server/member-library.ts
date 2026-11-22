import { bandFromDoc, bandSongArrangementFromDoc, memberFromDoc, publicMember, songFromDoc, tagFromDoc } from "@/lib/assignment-records";
import { isSongPublished } from "@/lib/domain";
import { memberAssignmentPage } from "@/lib/member-assignment-page";
import { sampleBands, sampleMembers } from "@/lib/sample-assignments";
import { sampleSongList } from "@/lib/sample-data";
import { getServerFirestore } from "@/lib/server/firebase-admin";

function memberStore() {
  return process.env.FIREBASE_ADMIN_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
    ? getServerFirestore()
    : null;
}

export async function readBandMembers() {
  const db = memberStore();
  if (!db) {
    return sampleMembers.map(publicMember).sort((left, right) => left.displayName.localeCompare(right.displayName));
  }
  const snapshot = await db.collection("members").orderBy("displayName").get();
  return snapshot.docs.map((doc) => publicMember(memberFromDoc(doc.id, doc.data())));
}

export async function readBandMemberParts(memberSlug: string, bandId: string | undefined, includeUnpublished: boolean) {
  const db = memberStore();
  const members = await readBandMembers();
  const member = members.find((item) => item.slug === memberSlug);
  if (!member) return null;

  const bands = db
    ? (await db.collection("bands").where("memberIds", "array-contains", member.id).get()).docs.map((doc) => bandFromDoc(doc.id, doc.data()))
    : sampleBands.filter((band) => band.memberIds.includes(member.id));
  const memberBands = [...bands].sort((left, right) => left.title.localeCompare(right.title));
  const selectedBand = memberBands.find((band) => band.id === bandId) ?? memberBands[0];
  if (!selectedBand) return null;

  if (!db) {
    return memberAssignmentPage({ member, memberBands, selectedBand, members, songs: sampleSongList(), tags: [], arrangements: [] });
  }

  const [songs, tags, arrangements] = await Promise.all([
    db.collection("songs").orderBy("sortTitle").get(),
    db.collection("songTags").orderBy("sortLabel").get(),
    db.collection("bandSongArrangements").where("bandId", "==", selectedBand.id).get(),
  ]);
  return memberAssignmentPage({
    member,
    memberBands,
    selectedBand,
    members,
    songs: songs.docs.map((doc) => songFromDoc(doc.id, doc.data()))
      .filter((song) => includeUnpublished || isSongPublished(song)),
    tags: tags.docs.map((doc) => tagFromDoc(doc.id, doc.data())).filter((tag) => tag.label),
    arrangements: arrangements.docs.map((doc) => bandSongArrangementFromDoc(doc.data())),
  });
}
