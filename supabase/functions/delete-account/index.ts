/**
 * POST /functions/v1/delete-account  { confirm: "DELETE" }
 * Removes the user's meal photos and auth account. All personal rows cascade
 * via foreign keys on auth.users.
 */
import { adminClient, authenticate, handler, HttpError, json, readJson } from "../_shared/http.ts";

Deno.serve(handler(async (req) => {
  const { user } = await authenticate(req);
  const body = await readJson<{ confirm?: string }>(req);
  if (body.confirm !== "DELETE") throw new HttpError(400, "confirmation_required", 'Send {"confirm":"DELETE"} to delete your account');
  const admin = adminClient();

  // Delete every object under the user's folder (paged).
  for (;;) {
    const { data, error } = await admin.storage.from("meal-images").list(user.id, { limit: 100 });
    if (error) throw error;
    if (!data?.length) break;
    const { error: rmErr } = await admin.storage.from("meal-images").remove(data.map((o) => `${user.id}/${o.name}`));
    if (rmErr) throw rmErr;
    if (data.length < 100) break;
  }
  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) throw error;
  return json({ deleted: true });
}));
