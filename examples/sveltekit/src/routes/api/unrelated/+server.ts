import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = ({ locals }) =>
  json({ ok: true, existingHookVisited: locals.existingHookVisited === true });
