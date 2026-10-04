export type Quality = 'low' | 'balanced' | 'high';
export type BranchInfo = {
  branch: string | null;
  linked: boolean;
  dirty: number;
  ahead: number;
  behind: number;
};
