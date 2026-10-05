/**
 * GET /api/todos/me — return action items for the currently authenticated user
 * Stub: reads ?userId= query param (real version uses Supabase Auth session).
 * Returns action_item rows joined with meeting_title.
 */

import { NextRequest, NextResponse } from "next/server";
import { todosStore } from "@/lib/mock-data";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);

  // Stub auth: accept ?userId= param; real impl reads from Supabase session cookie
  const userId = searchParams.get("userId");

  if (!userId) {
    // No userId → return all todos (useful for demo/admin view)
    return NextResponse.json(todosStore);
  }

  const myTodos = todosStore.filter(
    (item) => item.owner_id === userId
  );

  return NextResponse.json(myTodos);
}
