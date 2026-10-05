/**
 * PATCH /api/todos/:id — update the status of an action item
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { todosStore } from "@/lib/mock-data";

const PatchTodoSchema = z.object({
  status: z.enum(["todo", "done"], {
    errorMap: () => ({ message: "status must be 'todo' or 'done'" }),
  }),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

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

  const todo = todosStore.find((t) => t.id === id);
  if (!todo) {
    return NextResponse.json({ error: "Todo not found" }, { status: 404 });
  }

  todo.status = parsed.data.status;

  return NextResponse.json({ ok: true });
}
