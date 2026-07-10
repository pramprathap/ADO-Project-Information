/**
 * A resolved Azure DevOps identity (user).
 *
 * `descriptor` is the canonical, stable identifier returned by the Graph API and
 * is what we persist as the source of truth. Display name and email are stored
 * alongside it for presentation and to remain useful if the identity is later
 * removed from the organisation.
 */
export interface AzureDevOpsIdentity {
  /** Graph descriptor — the canonical stable identity id. */
  descriptor: string;
  displayName: string;
  email?: string;
  principalName?: string;
  /** Avatar/image URL when supplied by the Graph API (`_links.avatar.href`). */
  imageUrl?: string;
  /**
   * Whether the identity currently resolves to an active org member. `false`
   * indicates a stored identity that could not be re-resolved (removed/disabled)
   * so the UI can flag it. `undefined` means "not checked".
   */
  isActive?: boolean;
}

/** A person field may be unset, hence identities are nullable in the model. */
export type PersonField = AzureDevOpsIdentity | null;
