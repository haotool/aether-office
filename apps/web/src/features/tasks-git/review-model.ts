/** The verifier commands a workspace lists (stored as JSON text). */
export type Verifier = { name: string; sourceHash: string };

/** What a finished verify job recorded (stored as JSON text). */
export type VerifyOutcome = {
  verification?: { status: string; harnessHash: string; logHash: string };
  error?: string;
};

/** The workspace's verifiers; none when the workspace is not loaded yet. */
export const parseVerifiers = (raw: string | undefined): Verifier[] =>
  raw === undefined ? [] : (JSON.parse(raw) as Verifier[]);

/** A verify job's recorded outcome; null while the job has no result. */
export const parseVerifyOutcome = (raw: string | null | undefined): VerifyOutcome | null =>
  raw ? (JSON.parse(raw) as VerifyOutcome) : null;
