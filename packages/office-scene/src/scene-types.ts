export type Quality = 'low' | 'balanced' | 'high';
export type BranchInfo = {
  /** The repository the member works in: members sharing one are drawn on a thread when one is in hand. */
  repo?: string | null;
  branch: string | null;
  linked: boolean;
  dirty: number;
  ahead: number;
  behind: number;
};
