import { NextResponse } from "next/server";
import { googleConfig } from "@/lib/googleAuth";

export const dynamic = "force-dynamic";

/** Whether this deployment can offer Google sign-in, so the login page shows the button
 *  only when it would work. Reports a yes or no and nothing else — the client id and
 *  secret stay on the server. */
export async function GET() {
  return NextResponse.json({ enabled: googleConfig() !== null });
}
