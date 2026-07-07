/**
 * Client-side mirrors of server-side constants that aren't part of the wire
 * response (the backend enforces these but doesn't echo them back).
 * Keep in sync with `backend/src/routes/progress.ts`.
 */
export const MAX_HEARTS = 5;
export const MAX_CROWN_LEVEL = 5;
