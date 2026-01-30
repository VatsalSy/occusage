export type CodexUsageEntry = {
	sessionId: string;
	projectPath: string;
	timestamp: Date;
	model: string;
	provider?: string;
	tokens: {
		input: number;
		output: number;
		cache?: {
			read: number;
		};
		reasoning?: number;
	};
	cost?: number;
};
