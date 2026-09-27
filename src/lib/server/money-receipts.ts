import { createHash } from "node:crypto";
import { getStorage } from "firebase-admin/storage";
import { getServerAuth, getServerFirestore } from "@/lib/server/firebase-admin";
import { MoneyError, validMoneyId } from "@/lib/server/money-auth";

export const MAX_RECEIPT_BYTES = 8 * 1024 * 1024;
export interface Receipt {
  id: string;
  filename: string;
  contentType: string;
  size: number;
  storagePath: string;
  createdBy: string;
  createdAt: number;
  purchaseEntryId?: string;
}
function bucket() {
  const name = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
  if (!name) throw new MoneyError("Receipt storage is not configured.", 503);
  return getStorage(getServerAuth().app).bucket(name);
}
function sniff(data: Buffer) {
  if (data.subarray(0, 5).toString() === "%PDF-") return "application/pdf";
  if (data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff)
    return "image/jpeg";
  if (
    data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    return "image/png";
  if (
    data.subarray(0, 4).toString() === "RIFF" &&
    data.subarray(8, 12).toString() === "WEBP"
  )
    return "image/webp";
  throw new MoneyError("Use a JPEG, PNG, WebP, or PDF receipt.");
}
export async function saveMoneyReceipt(
  data: Buffer,
  filename: string,
  actor: string,
): Promise<Receipt> {
  if (!data.length || data.length > MAX_RECEIPT_BYTES)
    throw new MoneyError("Receipts must be smaller than 8 MB.", 413);
  const contentType = sniff(data),
    id = createHash("sha256").update(data).digest("hex");
  const reference = getServerFirestore().doc(`moneyReceipts/${id}`),
    existing = await reference.get();
  if (existing.exists) return existing.data() as Receipt;
  const receipt: Receipt = {
    id,
    contentType,
    size: data.length,
    filename:
      filename.replace(/[^A-Za-z0-9._ -]/g, "_").slice(0, 160) || "receipt",
    storagePath: `money-receipts/${id}`,
    createdBy: actor,
    createdAt: Date.now(),
  };
  await bucket()
    .file(receipt.storagePath)
    .save(data, {
      resumable: false,
      metadata: { contentType, cacheControl: "private, no-store" },
    });
  // Metadata contains no public download token. A racing upload must not clear a purchase link.
  await getServerFirestore().runTransaction(async (tx) => {
    if (!(await tx.get(reference)).exists) tx.create(reference, receipt);
  });
  return (await reference.get()).data() as Receipt;
}
export async function loadMoneyReceipt(id: string) {
  validMoneyId(id);
  const record = await getServerFirestore().doc(`moneyReceipts/${id}`).get();
  if (!record.exists) throw new MoneyError("Receipt not found.", 404);
  const receipt = record.data() as Receipt;
  const [data] = await bucket().file(receipt.storagePath).download();
  return { receipt, data };
}
