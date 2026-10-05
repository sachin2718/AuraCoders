/**
 * app/page.tsx  (root)
 * Redirects visitors: authenticated → /dashboard, anonymous → /login.
 */

import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase";

export default async function RootPage() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect("/dashboard");
  } else {
    redirect("/login");
  }
}
