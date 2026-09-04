import { sequence } from "@sveltejs/kit/hooks";
import type { Handle } from "@sveltejs/kit";
import { glyphHandle } from "$lib/server/glyphscramble";

const appHandle: Handle = async ({ event, resolve }) => {
  event.locals.existingHookVisited = true;
  const response = await resolve(event);
  const headers = new Headers(response.headers);
  headers.set("x-existing-hook", "composed");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
};

export const handle = sequence(glyphHandle, appHandle);
