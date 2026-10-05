import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { DEMO_USERS, getSupabaseServerClient, isSupabaseConfigured } from "@/lib/supabase";

const DemoRequestSchema = z.object({
  userKey: z.enum(["priya", "arjun", "meera"]),
});

const DEMO_PASSWORD = "demo-password";

/**
 * Provision one of the public demo profiles with the server-only Supabase key.
 * The browser still receives a normal Supabase session after this route returns;
 * the service key never leaves the server.
 */
export async function POST(request: NextRequest) {
  const parsed = DemoRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Choose a valid demo profile." }, { status: 422 });
  }

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ ok: true, mock: true });
  }

  try {
    const profile = DEMO_USERS[parsed.data.userKey];
    const admin = getSupabaseServerClient().auth.admin;
    const { data: users, error: listError } = await admin.listUsers({ page: 1, perPage: 1000 });

    if (listError) {
      return NextResponse.json({ error: "Supabase could not load demo profiles." }, { status: 503 });
    }

    const existing = (users?.users ?? []).find(
      (user) => user.email?.toLowerCase() === profile.email.toLowerCase(),
    );

    const result = existing
      ? await admin.updateUserById(existing.id, {
          password: DEMO_PASSWORD,
          email_confirm: true,
          user_metadata: profile.user_metadata,
        })
      : await admin.createUser({
          email: profile.email,
          password: DEMO_PASSWORD,
          email_confirm: true,
          user_metadata: profile.user_metadata,
        });

    if (result.error) {
      return NextResponse.json({ error: "Supabase could not prepare the demo profile." }, { status: 503 });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Supabase demo login is unavailable." }, { status: 503 });
  }
}
