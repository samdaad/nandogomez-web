// Única fuente de verdad del GA ID (docs/PLAN.md §4.2). Misma regex que scripts/lib/release-check.mjs.
const GA_ID = /^G-[A-Z0-9]{4,15}$/;

export const isValidGaId = (id: unknown): id is string => typeof id === 'string' && GA_ID.test(id);

/** ID de `PUBLIC_GA_ID` recortado y validado; `null` si falta o no es válido. */
export function getGaId(raw: string | undefined = import.meta.env.PUBLIC_GA_ID): string | null {
  const id = (raw ?? '').trim();
  return isValidGaId(id) ? id : null;
}
