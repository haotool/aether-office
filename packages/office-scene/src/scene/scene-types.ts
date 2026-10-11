export type Quality = 'low' | 'balanced' | 'high';
export type BranchInfo = {
  repo?: string | null;
  branch: string | null;
  linked: boolean;
  dirty: number;
  ahead: number;
  behind: number;
};
