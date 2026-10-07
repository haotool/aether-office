export const DEFAULT_WAIT_MS: number;
export const MAX_RULES: number;
export const MAX_RULE_CHARS: number;
export const NONCE_PATTERN: RegExp;
export function aetherDir(env?: Record<string, string | undefined>): string;
export function approvalConfigPath(env?: Record<string, string | undefined>): string;
export function readApprovalConfig(
  file?: string,
): { url: string; token: string; verifyKey: string } | null;
export type ApprovalProofFields = {
  id: string;
  nonce: string;
  behavior: 'allow' | 'deny';
  sessionRules: boolean;
};
export function approvalProof(key: string, fields: ApprovalProofFields): string;
export function proofMatches(key: string, fields: ApprovalProofFields, proof: unknown): boolean;
export function ensurePrivateDir(dir: string): void;
export function writePrivateFile(file: string, content: string, mode?: number): void;
