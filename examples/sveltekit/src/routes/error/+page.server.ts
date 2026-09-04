import type { PageServerLoad } from "./$types";

const PRIVATE_ERROR_DETAIL = "Sensitive error payload must stay server-only.";

export const load: PageServerLoad = () => {
  throw new Error(PRIVATE_ERROR_DETAIL);
};
