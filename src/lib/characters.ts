import type { Ui } from './ui-registry'

/**
 * Character role, in words.
 *
 * Shared by the index and the character page, the same way item acquisition
 * labels are, so the two cannot describe the same person differently.
 *
 * The wording is `role.*` in the interface-text registry, which is what makes
 * it editable and what stops a second copy appearing the next time a page needs
 * it.
 */
export const roleLabel = (role: string | null | undefined, ui: Ui): string | undefined =>
  role ? ui.label('role', role) : undefined
