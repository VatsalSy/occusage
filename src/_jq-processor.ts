import { Result } from '@praha/byethrow';
import spawn from 'nano-spawn';

/**
 * Process JSON data with a jq command
 * @param jsonData - The JSON data to process
 * @param jqCommand - The jq command/filter to apply
 * @returns The processed output from jq
 */
export async function processWithJq(jsonData: unknown, jqCommand: string): Result.ResultAsync<string, Error> {
	// Convert JSON data to string
	const jsonString = JSON.stringify(jsonData);

	// Use Result.try with object form to wrap spawn call
	const result = Result.try({
		try: async () => {
			const spawnResult = await spawn('jq', [jqCommand], {
				stdin: { string: jsonString },
			});
			return spawnResult.output.trim();
		},
		catch: (error: unknown) => {
			if (error instanceof Error) {
				// Check if jq is not installed
				if (error.message.includes('ENOENT') || error.message.includes('not found')) {
					return new Error('jq command not found. Please install jq to use the --jq option.');
				}
				// Return other errors (e.g., invalid jq syntax)
				return new Error(`jq processing failed: ${error.message}`);
			}
			return new Error('Unknown error during jq processing');
		},
	});

	return result();
}

// In-source tests

