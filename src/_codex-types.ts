import { z } from 'zod';
import { modelNameSchema } from './_types.ts';

export const codexUsageEntrySchema = z.object({
	sessionId: z.string(),
	projectPath: z.string(),
	timestamp: z.coerce.date(),
	model: modelNameSchema,
	provider: z.string().optional(),
	tokens: z.object({
		input: z.number(),
		output: z.number(),
		cache: z.object({
			read: z.number(),
		}).optional(),
		reasoning: z.number().optional(),
	}),
	cost: z.number().optional(),
});

export type CodexUsageEntry = z.infer<typeof codexUsageEntrySchema>;
