import process from 'node:process';
import Table from 'cli-table3';
import { uniq } from 'es-toolkit';
import pc from 'picocolors';
import stringWidth from 'string-width';

/**
 * Table row data type supporting strings, numbers, and formatted cell objects
 */
type TableRow = (string | number | { content: string; hAlign?: 'left' | 'right' | 'center' })[];
/**
 * Configuration options for creating responsive tables
 */
type TableOptions = {
	head: string[];
	colAligns?: ('left' | 'right' | 'center')[];
	style?: {
		head?: string[];
	};
	dateFormatter?: (dateStr: string) => string;
	compactHead?: string[];
	compactColAligns?: ('left' | 'right' | 'center')[];
	compactThreshold?: number;
};

/**
 * Responsive table class that adapts column widths based on terminal size
 * Automatically adjusts formatting and layout for different screen sizes
 */
export class ResponsiveTable {
	private head: string[];
	private rows: TableRow[] = [];
	private colAligns: ('left' | 'right' | 'center')[];
	private style?: { head?: string[] };
	private dateFormatter?: (dateStr: string) => string;
	private compactHead?: string[];
	private compactColAligns?: ('left' | 'right' | 'center')[];
	private compactThreshold: number;
	private compactMode = false;

	/**
	 * Creates a new responsive table instance
	 * @param options - Table configuration options
	 */
	constructor(options: TableOptions) {
		this.head = options.head;
		this.colAligns = options.colAligns ?? Array.from({ length: this.head.length }, () => 'left');
		this.style = options.style;
		this.dateFormatter = options.dateFormatter;
		this.compactHead = options.compactHead;
		this.compactColAligns = options.compactColAligns;
		this.compactThreshold = options.compactThreshold ?? 100;
	}

	/**
	 * Adds a row to the table
	 * @param row - Row data to add
	 */
	push(row: TableRow): void {
		this.rows.push(row);
	}

	/**
	 * Filters a row to compact mode columns
	 * @param row - Row to filter
	 * @param compactIndices - Indices of columns to keep in compact mode
	 * @returns Filtered row
	 */
	private filterRowToCompact(row: TableRow, compactIndices: number[]): TableRow {
		return compactIndices.map(index => row[index] ?? '');
	}

	/**
	 * Gets the current table head and col aligns based on compact mode
	 * @returns Current head and colAligns arrays
	 */
	private getCurrentTableConfig(): { head: string[]; colAligns: ('left' | 'right' | 'center')[] } {
		if (this.compactMode && this.compactHead != null && this.compactColAligns != null) {
			return { head: this.compactHead, colAligns: this.compactColAligns };
		}
		return { head: this.head, colAligns: this.colAligns };
	}

	/**
	 * Gets indices mapping from full table to compact table
	 * @returns Array of column indices to keep in compact mode
	 */
	private getCompactIndices(): number[] {
		if (this.compactHead == null || !this.compactMode) {
			return Array.from({ length: this.head.length }, (_, i) => i);
		}

		// Map compact headers to original indices
		return this.compactHead.map((compactHeader) => {
			const index = this.head.indexOf(compactHeader);
			if (index < 0) {
				// Log warning for debugging configuration issues
				console.warn(`Warning: Compact header "${compactHeader}" not found in table headers [${this.head.join(', ')}]. Using first column as fallback.`);
				return 0; // fallback to first column if not found
			}
			return index;
		});
	}

	/**
	 * Returns whether the table is currently in compact mode
	 * @returns True if compact mode is active
	 */
	isCompactMode(): boolean {
		return this.compactMode;
	}

	/**
	 * Renders the table as a formatted string
	 * Automatically adjusts layout based on terminal width
	 * @returns Formatted table string
	 */
	toString(): string {
		// Check environment variable first, then process.stdout.columns, then default
		const terminalWidth = Number.parseInt(process.env.COLUMNS ?? '', 10) || process.stdout.columns || 120;

		// Determine if we should use compact mode
		this.compactMode = terminalWidth < this.compactThreshold && this.compactHead != null;

		// Get current table configuration
		const { head, colAligns } = this.getCurrentTableConfig();
		const compactIndices = this.getCompactIndices();

		// Calculate actual content widths first (excluding separator rows)
		const dataRows = this.rows.filter(row => !this.isSeparatorRow(row));

		// Filter rows to compact mode if needed
		const processedDataRows = this.compactMode
			? dataRows.map(row => this.filterRowToCompact(row, compactIndices))
			: dataRows;

		const allRows = [head.map(String), ...processedDataRows.map(row => row.map((cell) => {
			if (typeof cell === 'object' && cell != null && 'content' in cell) {
				return String(cell.content);
			}
			return String(cell ?? '');
		}))];

		const contentWidths = head.map((_, colIndex) => {
			const maxLength = Math.max(
				...allRows.map(row => stringWidth(String(row[colIndex] ?? ''))),
			);
			return maxLength;
		});

		// Calculate table overhead
		const numColumns = head.length;
		const tableOverhead = 3 * numColumns + 1; // borders and separators
		const availableWidth = terminalWidth - tableOverhead;

		// Always use content-based widths with generous padding for numeric columns
		const columnWidths = contentWidths.map((width, index) => {
			const align = colAligns[index];
			// For numeric columns, ensure generous width to prevent truncation
			if (align === 'right') {
				return Math.max(width + 3, 11); // At least 11 chars for numbers, +3 padding
			}
			else if (index === 1) {
				// Models column - can be longer
				return Math.max(width + 2, 15);
			}
			return Math.max(width + 2, 10); // Other columns
		});

		// Check if this fits in the terminal
		const totalRequiredWidth = columnWidths.reduce((sum, width) => sum + width, 0) + tableOverhead;

		if (totalRequiredWidth > terminalWidth) {
			// Apply responsive resizing and use compact date format if available
			const scaleFactor = availableWidth / columnWidths.reduce((sum, width) => sum + width, 0);
			const adjustedWidths = columnWidths.map((width, index) => {
				const align = colAligns[index];
				let adjustedWidth = Math.floor(width * scaleFactor);

				// Apply minimum widths based on column type
				if (align === 'right') {
					adjustedWidth = Math.max(adjustedWidth, 10);
				}
				else if (index === 0) {
					adjustedWidth = Math.max(adjustedWidth, 10);
				}
				else if (index === 1) {
					adjustedWidth = Math.max(adjustedWidth, 12);
				}
				else {
					adjustedWidth = Math.max(adjustedWidth, 8);
				}

				return adjustedWidth;
			});

			const table = new Table({
				head,
				style: this.style,
				colAligns,
				colWidths: adjustedWidths,
				wordWrap: true,
				wrapOnWordBoundary: true,
			});

			// Add rows with special handling for separators and date formatting
			for (const row of this.rows) {
				if (this.isSeparatorRow(row)) {
					// Skip separator rows - cli-table3 will handle borders automatically
					continue;
				}
				else {
					// Use compact date format for first column if dateFormatter available
					let processedRow = row.map((cell, index) => {
						if (index === 0 && this.dateFormatter != null && typeof cell === 'string' && this.isDateString(cell)) {
							return this.dateFormatter(cell);
						}
						return cell;
					});

					// Filter to compact columns if in compact mode
					if (this.compactMode) {
						processedRow = this.filterRowToCompact(processedRow, compactIndices);
					}

					table.push(processedRow);
				}
			}

			return table.toString();
		}
		else {
			// Use generous column widths with normal date format
			const table = new Table({
				head,
				style: this.style,
				colAligns,
				colWidths: columnWidths,
				wordWrap: true,
				wrapOnWordBoundary: true,
			});

			// Add rows with special handling for separators
			for (const row of this.rows) {
				if (this.isSeparatorRow(row)) {
					// Skip separator rows - cli-table3 will handle borders automatically
					continue;
				}
				else {
					// Filter to compact columns if in compact mode
					const processedRow = this.compactMode
						? this.filterRowToCompact(row, compactIndices)
						: row;
					table.push(processedRow);
				}
			}

			return table.toString();
		}
	}

	/**
	 * Checks if a row is a separator row (contains only empty cells or dashes)
	 * @param row - Row to check
	 * @returns True if the row is a separator
	 */
	private isSeparatorRow(row: TableRow): boolean {
		// Check for both old-style separator rows (─) and new-style empty rows
		return row.every((cell) => {
			if (typeof cell === 'object' && cell != null && 'content' in cell) {
				return cell.content === '' || /^─+$/.test(cell.content);
			}
			return typeof cell === 'string' && (cell === '' || /^─+$/.test(cell));
		});
	}

	/**
	 * Checks if a string matches the YYYY-MM-DD date format
	 * @param text - String to check
	 * @returns True if the string is a valid date format
	 */
	private isDateString(text: string): boolean {
		// Check if string matches date format YYYY-MM-DD
		return /^\d{4}-\d{2}-\d{2}$/.test(text);
	}
}

/**
 * Formats a number with locale-specific thousand separators
 * @param num - The number to format
 * @returns Formatted number string with commas as thousand separators
 */
export function formatNumber(num: number): string {
	return num.toLocaleString('en-US');
}

/**
 * Formats a number as USD currency with dollar sign and 2 decimal places
 * @param amount - The amount to format
 * @returns Formatted currency string (e.g., "$12.34")
 */
export function formatCurrency(amount: number): string {
	return `$${amount.toFixed(2)}`;
}

/**
 * Formats Claude model names into a shorter, more readable format
 * Extracts model type and generation from full model name
 * @param modelName - Full model name (e.g., "claude-sonnet-4-20250514")
 * @returns Shortened model name (e.g., "sonnet-4") or original if pattern doesn't match
 */
export function formatModelName(modelName: string): string {
	// Extract model type from full model name
	// e.g., "claude-sonnet-4-20250514" -> "sonnet-4"
	// e.g., "claude-opus-4-20250514" -> "opus-4"
	const match = modelName.match(/claude-(\w+)-(\d+)-\d+/);
	if (match != null) {
		return `${match[1]}-${match[2]}`;
	}
	// Return original if pattern doesn't match
	return modelName;
}

/**
 * Formats an array of model names for display as a comma-separated string
 * Removes duplicates and sorts alphabetically
 * @param models - Array of model names
 * @returns Formatted string with unique, sorted model names separated by commas
 */
export function formatModelsDisplay(models: string[]): string {
	// Format array of models for display
	const uniqueModels = uniq(models.map(formatModelName));
	return uniqueModels.sort().join(', ');
}

/**
 * Formats an array of model names for display with each model on a new line
 * Removes duplicates and sorts alphabetically
 * @param models - Array of model names
 * @returns Formatted string with unique, sorted model names as a bulleted list
 */
export function formatModelsDisplayMultiline(models: string[]): string {
	// Format array of models for display with newlines and bullet points
	const uniqueModels = uniq(models.map(formatModelName));
	return uniqueModels.sort().map(model => `- ${model}`).join('\n');
}

/**
 * Pushes model breakdown rows to a table
 * @param table - The table to push rows to
 * @param table.push - Method to add rows to the table
 * @param breakdowns - Array of model breakdowns
 * @param extraColumns - Number of extra empty columns before the data (default: 1 for models column)
 * @param trailingColumns - Number of extra empty columns after the data (default: 0)
 */
export function pushBreakdownRows(
	table: { push: (row: (string | number)[]) => void },
	breakdowns: Array<{
		modelName: string;
		inputTokens: number;
		outputTokens: number;
		cacheCreationTokens: number;
		cacheReadTokens: number;
		cost: number;
	}>,
	extraColumns = 1,
	trailingColumns = 0,
): void {
	for (const breakdown of breakdowns) {
		// Start with empty first column (Source), then model name in second column (Models)
		const row: (string | number)[] = ['', `  └─ ${formatModelName(breakdown.modelName)}`];

		// Add extra empty columns before data (reduced by 1 since we already added the Models column)
		for (let i = 0; i < extraColumns - 1; i++) {
			row.push('');
		}

		// Add data columns with gray styling
		const totalTokens = breakdown.inputTokens + breakdown.outputTokens
			+ breakdown.cacheCreationTokens + breakdown.cacheReadTokens;

		row.push(
			pc.gray(formatNumber(breakdown.inputTokens)),
			pc.gray(formatNumber(breakdown.outputTokens)),
			pc.gray(formatNumber(breakdown.cacheCreationTokens)),
			pc.gray(formatNumber(breakdown.cacheReadTokens)),
			pc.gray(formatNumber(totalTokens)),
			pc.gray(formatCurrency(breakdown.cost)),
		);

		// Add trailing empty columns
		for (let i = 0; i < trailingColumns; i++) {
			row.push('');
		}

		table.push(row);
	}
}



/**
 * Format source indicators for display with colors
 * @param sources - Array of data sources (claude or opencode)
 * @returns Formatted source string with colored indicators
 */
export function formatSources(sources: Array<'claude' | 'opencode' | string>): string {
	if (sources == null || sources.length === 0) {
		return '-';
	}
	const icons = sources.map((s) => {
		if (s === 'claude') {
			return pc.blue('[C]');
		}
		if (s === 'opencode') {
			return pc.green('[O]');
		}
		// Fallback for any other source
		return `[${s}]`;
	});
	return icons.join(' ');
}

/**
 * Format date for display
 */
export function formatDate(dateStr: string): string {
	const date = new Date(dateStr);
	return date.toLocaleDateString();
}

/**
 * Format time for display
 */
export function formatTime(dateStr: string): string {
	const date = new Date(dateStr);
	return date.toLocaleTimeString();
}

/**
 * Format duration in milliseconds to human readable
 */
export function formatDuration(ms: number): string {
	const seconds = Math.floor(ms / 1000);
	const minutes = Math.floor(seconds / 60);
	const hours = Math.floor(minutes / 60);
	
	if (hours > 0) {
		return `${hours}h ${minutes % 60}m`;
	} else if (minutes > 0) {
		return `${minutes}m ${seconds % 60}s`;
	} else {
		return `${seconds}s`;
	}
}

/**
 * Format percentage for display
 */
export function formatPercentage(value: number): string {
	return `${(value * 100).toFixed(1)}%`;
}

/**
 * Format bytes to human readable
 */
export function formatBytes(bytes: number): string {
	const sizes = ["B", "KB", "MB", "GB"];
	if (bytes === 0) return "0 B";
	const i = Math.floor(Math.log(bytes) / Math.log(1024));
	return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`;
}
