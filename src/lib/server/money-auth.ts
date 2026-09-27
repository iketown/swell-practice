import { getServerAuth, getServerFirestore } from "@/lib/server/firebase-admin";
import { founderForEmail } from "@/lib/money/identity";
import { ZodError } from "zod";

export class MoneyError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}
async function verifiedMoneyAdmin(request: Request) {
  const token = /^Bearer (.+)$/.exec(
    request.headers.get("authorization") ?? "",
  )?.[1];
  if (!token)
    throw new MoneyError("Sign in as an administrator to use Money.", 401);
  try {
    const user = await getServerAuth().verifyIdToken(token, true);
    const emails = (process.env.NEXT_PUBLIC_ADMIN_EMAILS ?? "")
      .split(",")
      .map((v) => v.trim().toLowerCase())
      .filter(Boolean);
    const listed = Boolean(
      user.email && emails.includes(user.email.toLowerCase()),
    );
    if (
      !listed &&
      !(await getServerFirestore().doc(`admins/${user.uid}`).get()).exists
    )
      throw new MoneyError("Administrator access is required.", 403);
    return user;
  } catch (error) {
    if (error instanceof MoneyError) throw error;
    throw new MoneyError(
      "Could not verify your administrator session. Sign in again.",
      401,
    );
  }
}
export async function requireMoneyAdmin(request: Request) {
  return (await verifiedMoneyAdmin(request)).uid;
}
export async function requireMoneyFounder(request: Request) {
  const user = await verifiedMoneyAdmin(request);
  const person = founderForEmail(user.email, {
    ikeEmail: process.env.NEXT_PUBLIC_MONEY_IKE_EMAIL,
    chrisEmail: process.env.NEXT_PUBLIC_MONEY_CHRIS_EMAIL,
  });
  if (!person)
    throw new MoneyError("This administrator is not mapped to Ike or Chris. Check the Money founder email settings.", 403);
  return { actor: user.uid, person };
}
export function moneyErrorResponse(error: unknown) {
  if (error instanceof ZodError)
    return Response.json(
      { error: error.issues.map((i) => i.message).join(" ") },
      { status: 400 },
    );
  if (error instanceof MoneyError)
    return Response.json({ error: error.message }, { status: error.status });
  console.error(
    "Money request failed",
    error instanceof Error ? error.message : "Unknown error",
  );
  return Response.json(
    {
      error:
        "Could not save or load Money. Check the server configuration and try again.",
    },
    { status: 500 },
  );
}
export function validMoneyId(id: string) {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(id))
    throw new MoneyError("Invalid record ID.");
  return id;
}
