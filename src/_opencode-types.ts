import { z } from 'zod';

/**
 * OpenCode session info schema
 */
export const opencodeSessionInfoSchema = z.object({
	id: z.string(),
	title: z.string().optional(),
	lastMessage: z.number().optional(), // Unix timestamp
	createdAt: z.number().optional(), // Unix timestamp
});

export type OpenCodeSessionInfo = z.infer<typeof opencodeSessionInfoSchema>;

/**
 * OpenCode message schema
 */
export const opencodeMessageSchema = z.object({
	id: z.string(),
	role: z.enum(['user', 'assistant', 'system']),
	sessionID: z.string().optional(),
	time: z
		.object({
			created: z.number().optional(),
			completed: z.number().optional(),
		})
		.optional(),
	modelID: z.string().optional(), // Model identifier (e.g., "claude-opus-4-1-20250805")
	providerID: z.string().optional(), // Provider (e.g., "anthropic")
	provider: z.string().optional(), // Legacy field
	model: z.string().optional(), // Legacy field
	systemPrompt: z.string().optional(),
});

export type OpenCodeMessage = z.infer<typeof opencodeMessageSchema>;

/**
 * OpenCode part schema (contains token and cost data)
 */
export const opencodePartSchema = z.object({
	id: z.string(),
	type: z.enum(['step-finish', 'text', 'tool-use', 'tool-result', 'error']),
	tokens: z
		.object({
			input: z.number().optional(),
			output: z.number().optional(),
			reasoning: z.number().optional(),
			cache: z
				.object({
					read: z.number().optional(),
					write: z.number().optional(),
				})
				.optional(),
		})
		.optional(),
	cost: z.number().optional(),
	modelID: z.string().optional(),
	providerID: z.string().optional(),
	time: z
		.object({
			created: z.number().optional(), // Unix timestamp
			completed: z.number().optional(), // Unix timestamp
		})
		.optional(),
	text: z.string().optional(),
});

export type OpenCodePart = z.infer<typeof opencodePartSchema>;

/**
 * Unified OpenCode entry after aggregation
 */
export type OpenCodeUsageEntry = {
	sessionId: string;
	projectPath: string; // Decoded project path
	encodedProjectPath: string; // Original encoded path
	timestamp: Date;
	model: string;
	provider?: string;
	tokens: {
		input: number;
		output: number;
		cache?: {
			read: number;
			write: number;
		};
		reasoning?: number;
	};
	cost?: number;
	messageId?: string;
	type: 'user' | 'assistant' | 'system';
};
