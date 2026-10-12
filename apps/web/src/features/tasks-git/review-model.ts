export type Verifier = { name: string; sourceHash: string };

export type VerifyOutcome = {
  verification?: { status: string; harnessHash: string; logHash: string };
  error?: string;
};

export const parseVerifiers = (raw: string | undefined): Verifier[] =>
  raw === undefined ? [] : (JSON.parse(raw) as Verifier[]);

export const parseVerifyOutcome = (raw: string | null | undefined): VerifyOutcome | null =>
  raw ? (JSON.parse(raw) as VerifyOutcome) : null;
