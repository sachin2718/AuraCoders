/**
 * scripts/test-cross-user-todos.ts
 *
 * Acceptance Test: Cross-User Todo Security Isolation
 *
 * PROVES:
 * 1. Unauthenticated requests to /api/todos/me and /api/todos/:id receive 401.
 * 2. User A cannot read User B's action items via GET /api/todos/me.
 * 3. User B cannot read User A's action items via GET /api/todos/me.
 * 4. GET /api/todos/me joins meeting_title and orders by due_date nulls last.
 * 5. User A cannot modify User B's action items via PATCH /api/todos/:id (403 Forbidden).
 * 6. User B cannot modify User A's action items via PATCH /api/todos/:id (403 Forbidden).
 * 7. Legitimate owners can update their own items to 'done' (200 OK).
 * 8. Consistent 404 (non-existent item) vs 403 (item owned by someone else).
 * 9. Input validation rejects invalid status values with 422.
 */

import { NextRequest } from "next/server";
import { GET as getMyTodosRoute } from "../app/api/todos/me/route";
import { PATCH as patchTodoRoute } from "../app/api/todos/[id]/route";
import { createMeeting, saveResults, getActionItem, ActionItem } from "../lib/db";

async function runCrossUserSecurityTest() {
  console.log("=================================================");
  console.log(" Cross-User Todo Security Acceptance Test");
  console.log("=================================================\n");

  const userA = "user-alice-0001";
  const userB = "user-bob-0002";

  // 1. Setup meeting and action items for User A and User B
  const meeting = await createMeeting({
    title: "Security & Permissions Review",
    hostId: userA,
  });

  const itemA1Id = crypto.randomUUID();
  const itemA2Id = crypto.randomUUID();
  const itemB1Id = crypto.randomUUID();

  await saveResults(meeting.id, {
    summary: {
      tldr: "Discussed security boundary requirements.",
      key_points: ["Strict cross-user isolation"],
      decisions: ["Enforce 403 on foreign items"],
      open_questions: [],
    },
    actionItems: [
      {
        id: itemA1Id,
        owner_id: userA,
        owner_name: "Alice",
        title: "Implement Auth Middleware",
        due_date: "2026-10-15", // specific date
        priority: "high",
        status: "todo",
        source_quote: "Alice will do it",
        t_ms: 1000,
      },
      {
        id: itemA2Id,
        owner_id: userA,
        owner_name: "Alice",
        title: "Write documentation",
        due_date: null, // null due date (should be sorted LAST)
        priority: "low",
        status: "todo",
        source_quote: "Alice docs",
        t_ms: 2000,
      },
      {
        id: itemB1Id,
        owner_id: userB,
        owner_name: "Bob",
        title: "Penetration Testing Audit",
        due_date: "2026-10-05", // earlier date
        priority: "medium",
        status: "todo",
        source_quote: "Bob security audit",
        t_ms: 3000,
      },
    ],
  });

  // ─── Test 1: Unauthenticated requests -> 401 ──────────────────────────────
  console.log("[Test 1] Testing unauthenticated GET /api/todos/me (expect 401)...");
  const unauthGetReq = new NextRequest("http://localhost:3000/api/todos/me");
  const unauthGetRes = await getMyTodosRoute(unauthGetReq);
  console.log(`✓ Unauthenticated GET status: ${unauthGetRes.status}`);
  if (unauthGetRes.status !== 401) {
    throw new Error(`Expected 401, got ${unauthGetRes.status}`);
  }

  console.log("\n[Test 2] Testing unauthenticated PATCH /api/todos/:id (expect 401)...");
  const unauthPatchReq = new NextRequest(`http://localhost:3000/api/todos/${itemA1Id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status: "done" }),
  });
  const unauthPatchRes = await patchTodoRoute(unauthPatchReq, {
    params: Promise.resolve({ id: itemA1Id }),
  });
  console.log(`✓ Unauthenticated PATCH status: ${unauthPatchRes.status}`);
  if (unauthPatchRes.status !== 401) {
    throw new Error(`Expected 401, got ${unauthPatchRes.status}`);
  }

  // ─── Test 3: User A reads their own todos -> no User B items ──────────────
  console.log("\n[Test 3] User A fetches GET /api/todos/me (must NOT contain User B's items)...");
  const userAGetReq = new NextRequest("http://localhost:3000/api/todos/me", {
    headers: { "x-user-id": userA },
  });
  const userAGetRes = await getMyTodosRoute(userAGetReq);
  if (userAGetRes.status !== 200) {
    throw new Error(`Expected 200, got ${userAGetRes.status}`);
  }
  const userATodos: Array<ActionItem & { meeting_title?: string }> = await userAGetRes.json();
  console.log(`✓ User A received ${userATodos.length} items`);

  // Verify none belong to User B
  const containsUserBItem = userATodos.some((t) => t.id === itemB1Id || t.owner_id === userB);
  if (containsUserBItem) {
    throw new Error("SECURITY VIOLATION: User A was able to read User B's action items!");
  }
  console.log("✓ User A cannot see any items belonging to User B.");

  // Verify meeting_title is joined
  if (!userATodos[0]?.meeting_title) {
    throw new Error("Expected meeting_title to be joined in response!");
  }
  console.log(`✓ Joined meeting title: "${userATodos[0].meeting_title}"`);

  // Verify due_date nulls last ordering: itemA1 (2026-10-15) must come BEFORE itemA2 (null)
  console.log(`  - 1st item: "${userATodos[0].title}" (due_date: ${userATodos[0].due_date})`);
  console.log(`  - 2nd item: "${userATodos[1].title}" (due_date: ${userATodos[1].due_date})`);
  if (userATodos[0].id !== itemA1Id || userATodos[1].id !== itemA2Id) {
    throw new Error("Ordering violated: expected dated items first, nulls last!");
  }
  console.log("✓ Order verified: due_date nulls last passed.");

  // ─── Test 4: User B reads their own todos -> no User A items ──────────────
  console.log("\n[Test 4] User B fetches GET /api/todos/me (must NOT contain User A's items)...");
  const userBGetReq = new NextRequest("http://localhost:3000/api/todos/me", {
    headers: { "x-user-id": userB },
  });
  const userBGetRes = await getMyTodosRoute(userBGetReq);
  const userBTodos: Array<ActionItem & { meeting_title?: string }> = await userBGetRes.json();
  console.log(`✓ User B received ${userBTodos.length} items`);

  const containsUserAItem = userBTodos.some((t) => t.id === itemA1Id || t.id === itemA2Id || t.owner_id === userA);
  if (containsUserAItem) {
    throw new Error("SECURITY VIOLATION: User B was able to read User A's action items!");
  }
  console.log("✓ User B cannot see any items belonging to User A.");

  // ─── Test 5: User A attempts to modify User B's item (expect 403) ─────────
  console.log("\n[Test 5] User A attempts to PATCH User B's action item (expect 403 Forbidden)...");
  const userAModifyBReq = new NextRequest(`http://localhost:3000/api/todos/${itemB1Id}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "x-user-id": userA,
    },
    body: JSON.stringify({ status: "done" }),
  });
  const userAModifyBRes = await patchTodoRoute(userAModifyBReq, {
    params: Promise.resolve({ id: itemB1Id }),
  });
  console.log(`✓ Cross-user modification status: ${userAModifyBRes.status}`);
  if (userAModifyBRes.status !== 403) {
    throw new Error(`Expected 403 Forbidden, got ${userAModifyBRes.status}`);
  }

  // Verify item was NOT modified in the database
  const itemB1AfterAttack = await getActionItem(itemB1Id);
  if (itemB1AfterAttack?.status !== "todo") {
    throw new Error("SECURITY VIOLATION: User B's item was modified by User A!");
  }
  console.log("✓ User B's item status remained 'todo' (unmodified).");

  // ─── Test 6: User B attempts to modify User A's item (expect 403) ─────────
  console.log("\n[Test 6] User B attempts to PATCH User A's action item (expect 403 Forbidden)...");
  const userBModifyAReq = new NextRequest(`http://localhost:3000/api/todos/${itemA1Id}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "x-user-id": userB,
    },
    body: JSON.stringify({ status: "done" }),
  });
  const userBModifyARes = await patchTodoRoute(userBModifyAReq, {
    params: Promise.resolve({ id: itemA1Id }),
  });
  console.log(`✓ Cross-user modification status: ${userBModifyARes.status}`);
  if (userBModifyARes.status !== 403) {
    throw new Error(`Expected 403 Forbidden, got ${userBModifyARes.status}`);
  }

  const itemA1AfterAttack = await getActionItem(itemA1Id);
  if (itemA1AfterAttack?.status !== "todo") {
    throw new Error("SECURITY VIOLATION: User A's item was modified by User B!");
  }
  console.log("✓ User A's item status remained 'todo' (unmodified).");

  // ─── Test 7: Legitimate modification by owner (expect 200) ────────────────
  console.log("\n[Test 7] User A legitimately modifies their own item (expect 200 OK)...");
  const userAModifySelfReq = new NextRequest(`http://localhost:3000/api/todos/${itemA1Id}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "x-user-id": userA,
    },
    body: JSON.stringify({ status: "done" }),
  });
  const userAModifySelfRes = await patchTodoRoute(userAModifySelfReq, {
    params: Promise.resolve({ id: itemA1Id }),
  });
  console.log(`✓ Owner modification status: ${userAModifySelfRes.status}`);
  if (userAModifySelfRes.status !== 200) {
    throw new Error(`Expected 200 OK, got ${userAModifySelfRes.status}`);
  }

  const itemA1Updated = await getActionItem(itemA1Id);
  if (itemA1Updated?.status !== "done") {
    throw new Error(`Expected status 'done', got ${itemA1Updated?.status}`);
  }
  console.log("✓ User A's item status successfully updated to 'done'.");

  // ─── Test 8: Consistent 404 vs 403 ───────────────────────────────────────
  console.log("\n[Test 8] Testing non-existent item (expect 404 Not Found vs 403 Forbidden)...");
  const nonExistentReq = new NextRequest(`http://localhost:3000/api/todos/00000000-0000-0000-0000-000000000000`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "x-user-id": userA,
    },
    body: JSON.stringify({ status: "done" }),
  });
  const nonExistentRes = await patchTodoRoute(nonExistentReq, {
    params: Promise.resolve({ id: "00000000-0000-0000-0000-000000000000" }),
  });
  console.log(`✓ Non-existent item status: ${nonExistentRes.status}`);
  if (nonExistentRes.status !== 404) {
    throw new Error(`Expected 404 Not Found, got ${nonExistentRes.status}`);
  }
  console.log("✓ 404 vs 403 consistency verified.");

  // ─── Test 9: Input validation with Zod (expect 422) ───────────────────────
  console.log("\n[Test 9] Testing invalid status payload (expect 422 Unprocessable Entity)...");
  const invalidStatusReq = new NextRequest(`http://localhost:3000/api/todos/${itemA1Id}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "x-user-id": userA,
    },
    body: JSON.stringify({ status: "in_progress" }), // only 'todo' or 'done' allowed
  });
  const invalidStatusRes = await patchTodoRoute(invalidStatusReq, {
    params: Promise.resolve({ id: itemA1Id }),
  });
  console.log(`✓ Invalid payload status: ${invalidStatusRes.status}`);
  if (invalidStatusRes.status !== 422) {
    throw new Error(`Expected 422, got ${invalidStatusRes.status}`);
  }
  console.log("✓ Zod validation rejected invalid status payload.");

  console.log("\n=================================================");
  console.log(" ALL CROSS-USER SECURITY TESTS PASSED! 🛡️");
  console.log("=================================================\n");
}

runCrossUserSecurityTest().catch((err) => {
  console.error("❌ Cross-user security test failed:", err);
  process.exit(1);
});
