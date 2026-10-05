/**
 * PATCH /api/todos/:id — Update the status of an action item
 *
 * RULES:
 * - Requires a signed-in user (401 otherwise).
 * - Input validated with Zod ({ status: "todo" | "done" }).
 * - 404 if action item does not exist.
 * - 403 if action item exists but owner_id !== current user.
 * - Updates status and returns { ok: true, todo }.
 * - No stack traces in responses, no secrets in logs.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthUser } from "@/lib/auth";
import { getActionItem, updateTodoStatus } from "@/lib/db";

const PatchTodoSchema = z.object({
  status: z.enum(["todo", "done"], {
    errorMap: () => ({ message: "status must be 'todo' or 'done'" }),
  }),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // 1. Require signed-in user
    const user = await getAuthUser(req);
    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized: signed-in user required" },
        { status: 401 }
      );
    }

    const { id } = await params;

    // 2. Validate input body with Zod
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const parsed = PatchTodoSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", issues: parsed.error.issues },
        { status: 422 }
      );
    }

    // 3. Lookup action item: 404 vs 403 consistency
    const item = await getActionItem(id);
    if (!item) {
      return NextResponse.json(
        { error: "Action item not found" },
        { status: 404 }
      );
    }

    // 4. Ownership authorization: succeeds only if owner_id = current user, otherwise 403
    if (item.owner_id !== user.id) {
      return NextResponse.json(
        { error: "Forbidden: You do not own this action item" },
        { status: 403 }
      );
    }

    // 5. Update status
    const updated = await updateTodoStatus(id, user.id, parsed.data.status);

    return NextResponse.json({ ok: true, todo: updated });
  } catch (error) {
    // No stack traces or secrets leaked in responses
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
