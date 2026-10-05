/**
 * GET /api/todos/me — Return action items for the currently authenticated user
 *
 * RULES:
 * - Requires a signed-in user (401 otherwise).
 * - Returns only action_items where owner_id = current user.
 * - Joined with the meeting title.
 * - Ordered by due_date nulls last.
 * - No stack traces in responses, no secrets in logs.
 */

import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { getTodosForUser } from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    // 1. Require signed-in user
    const user = await getAuthUser(req);
    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized: signed-in user required" },
        { status: 401 }
      );
    }

    // 2. Fetch action items owned by user, joined with meeting title, ordered by due_date nulls last
    const todos = await getTodosForUser(user.id);

    return NextResponse.json(todos);
  } catch (error) {
    // Never leak internal stack traces or secrets to the client
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
