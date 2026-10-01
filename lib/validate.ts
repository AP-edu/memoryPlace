// Small request-body validators shared by API routes.
export const isFiniteNum = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);
export const isPosNum = (n: unknown): n is number => isFiniteNum(n) && n > 0;
export const isInt = (n: unknown): n is number => isFiniteNum(n) && Number.isInteger(n);

/** Largest coordinate accepted for room placement on a level (metres). */
export const MAX_COORD = 10_000;
export const MAX_ROOM_SIZE = 1_000;
export const ROTATIONS = [0, 90, 180, 270] as const;
