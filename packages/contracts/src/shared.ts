import { z } from 'zod';

export const id = z.string().uuid();
export const shortText = z.string().trim().min(1).max(160);
