type WorkflowTemplate =
  'claude_codex_review' | 'codex_claude_review' | 'frontend_backend' | 'research_design_impl';

type StepPlan = {
  role: string;
  titleSuffix: string;
  acceptanceNote: string;
  dependsOn: number[];
  engineerProvider?: 'claude' | 'codex';
  reviewerProvider?: 'claude' | 'codex';
};

const REVIEW_LOOP =
  'Review findings are addressed (at most three fix attempts), the pinned verifier passes at the reviewed commit, and a human accepts the result.';

export const TEMPLATES: Record<WorkflowTemplate, readonly StepPlan[]> = {
  claude_codex_review: [
    {
      role: 'engineer+reviewer',
      titleSuffix: '',
      acceptanceNote: `Implemented by a Claude agent and reviewed read-only by a Codex agent. ${REVIEW_LOOP}`,
      dependsOn: [],
      engineerProvider: 'claude',
      reviewerProvider: 'codex',
    },
  ],
  codex_claude_review: [
    {
      role: 'engineer+reviewer',
      titleSuffix: '',
      acceptanceNote: `Implemented by a Codex agent and reviewed read-only by a Claude agent. ${REVIEW_LOOP}`,
      dependsOn: [],
      engineerProvider: 'codex',
      reviewerProvider: 'claude',
    },
  ],
  frontend_backend: [
    {
      role: 'frontend',
      titleSuffix: ' · Frontend',
      acceptanceNote: 'Frontend part, built in its own worktree. Do not touch backend paths.',
      dependsOn: [],
    },
    {
      role: 'backend',
      titleSuffix: ' · Backend',
      acceptanceNote: 'Backend part, built in its own worktree. Do not touch frontend paths.',
      dependsOn: [],
    },
    {
      role: 'integration',
      titleSuffix: ' · Integration review',
      acceptanceNote: `Both parts are integrated, reviewed together, and tested at the integrated commit. ${REVIEW_LOOP}`,
      dependsOn: [0, 1],
    },
  ],
  research_design_impl: [
    {
      role: 'research',
      titleSuffix: ' · Research',
      acceptanceNote:
        'Findings with every source recorded (URL, date, what was read). Opinions are labelled as such.',
      dependsOn: [],
    },
    {
      role: 'design',
      titleSuffix: ' · Design',
      acceptanceNote:
        'A design that cites the research findings and states the trade-offs and rejected options.',
      dependsOn: [0],
    },
    {
      role: 'implementation',
      titleSuffix: ' · Implementation',
      acceptanceNote: 'Implements the approved design; deviations are listed with reasons.',
      dependsOn: [1],
    },
    {
      role: 'verification',
      titleSuffix: ' · Verification',
      acceptanceNote:
        'Tests and evidence tied to the implemented commit; any gap against the design is reported, not hidden.',
      dependsOn: [2],
    },
  ],
};
