/**
 * @fileoverview Project name formatting and alias utilities
 *
 * Provides utilities for formatting raw project directory names into user-friendly
 * display names with support for custom aliases and improved path parsing.
 *
 * @module project-names
 */

import process from 'node:process';
import { PROJECT_ALIASES_ENV } from './_consts.ts';

/**
 * Cache for parsed aliases to avoid repeated parsing
 */
let aliasCache: Map<string, string> | null = null;

/**
 * Parse project aliases from environment variable
 * @returns Map of raw project names to their aliases
 */
function getProjectAliases(): Map<string, string> {
	if (aliasCache !== null) {
		return aliasCache;
	}

	aliasCache = new Map();

	const aliasEnv = (process.env[PROJECT_ALIASES_ENV] ?? '').trim();
	if (aliasEnv === '') {
		return aliasCache;
	}

	// Parse comma-separated name=alias pairs
	const pairs = aliasEnv.split(',').map(pair => pair.trim()).filter(pair => pair !== '');
	for (const pair of pairs) {
		const parts = pair.split('=').map(s => s.trim());
		const rawName = parts[0];
		const alias = parts[1];
		if (rawName != null && alias != null && rawName !== '' && alias !== '') {
			aliasCache.set(rawName, alias);
		}
	}

	return aliasCache;
}

/**
 * Clear the alias cache (useful for testing)
 * @internal
 */
export function clearAliasCache(): void {
	aliasCache = null;
}

/**
 * Extract meaningful project name from directory-style project paths
 * Uses improved heuristics to handle complex project structures
 *
 * @param projectName - Raw project name from directory path
 * @returns Cleaned and formatted project name
 *
 * @example
 * ```typescript
 * // Basic cleanup
 * parseProjectName('-Users-phaedrus-Development-occusage')
 * // → 'occusage'
 *
 * // Complex project with feature branch
 * parseProjectName('-Users-phaedrus-Development-adminifi-edugakko-api--feature-ticket-002-configure-dependabot')
 * // → 'configure-dependabot'
 *
 * // Handle unknown projects
 * parseProjectName('unknown')
 * // → 'Unknown Project'
 * ```
 */
export function parseProjectName(projectName: string): string {
	if (projectName === 'unknown' || projectName === '') {
		return 'Unknown Project';
	}

	// Remove common directory prefixes
	let cleaned = projectName;

	// Handle Windows-style paths: C:\Users\... or \Users\...
	if (cleaned.match(/^[A-Z]:\\Users\\|^\\Users\\/) != null) {
		const segments = cleaned.split('\\');
		const userIndex = segments.findIndex(seg => seg === 'Users');
		if (userIndex !== -1 && userIndex + 3 < segments.length) {
			// Take everything after Users/username/Projects or similar
			cleaned = segments.slice(userIndex + 3).join('-');
		}
	}

	// Handle Unix-style paths: /Users/... or -Users-...
	if (cleaned.startsWith('-Users-') || cleaned.startsWith('/Users/')) {
		const separator = cleaned.startsWith('-Users-') ? '-' : '/';
		const segments = cleaned.split(separator).filter(s => s.length > 0);
		const userIndex = segments.findIndex(seg => seg === 'Users');

		if (userIndex !== -1 && userIndex + 3 < segments.length) {
			// Take everything after Users/username/Development or similar
			cleaned = segments.slice(userIndex + 3).join('-');
		}
	}

	// If no path cleanup occurred, use original name
	if (cleaned === projectName) {
		// Just basic cleanup for non-path names
		cleaned = projectName.replace(/^[/\\-]+|[/\\-]+$/g, '');
	}

	// Handle UUID-like patterns
	if (cleaned.match(/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/i) != null) {
		// Extract last two segments of UUID for brevity
		const parts = cleaned.split('-');
		if (parts.length >= 5) {
			// Take the last two segments, which may include file extension in the last segment
			cleaned = parts.slice(-2).join('-');
		}
	}

	// Improved project name extraction for complex names
	if (cleaned.includes('--')) {
		// Handle project--feature patterns like "adminifi-edugakko-api--feature-ticket-002"
		const parts = cleaned.split('--');
		if (parts.length >= 2 && parts[0] != null) {
			// Take the main project part before the first --
			cleaned = parts[0];
		}
	}

	// For compound project names, try to extract the most meaningful part
	if (cleaned.includes('-') && cleaned.length > 20) {
		const segments = cleaned.split('-');

		// Look for common meaningful patterns
		const meaningfulSegments = segments.filter(seg =>
			seg.length > 2
			&& seg.match(/^(?:dev|development|feat|feature|fix|bug|test|staging|prod|production|main|master|branch)$/i) == null,
		);

		// If we have compound project names like "adminifi-edugakko-api"
		// Try to find the last 2-3 meaningful segments
		if (meaningfulSegments.length >= 2) {
			// Take last 2-3 segments to get "edugakko-api" from "adminifi-edugakko-api"
			const lastSegments = meaningfulSegments.slice(-2);
			if (lastSegments.join('-').length >= 6) {
				cleaned = lastSegments.join('-');
			}
			else if (meaningfulSegments.length >= 3) {
				cleaned = meaningfulSegments.slice(-3).join('-');
			}
		}
	}

	// Final cleanup
	cleaned = cleaned.replace(/^[/\\-]+|[/\\-]+$/g, '');

	return cleaned !== '' ? cleaned : (projectName !== '' ? projectName : 'Unknown Project');
}

/**
 * Format project name for display with custom alias support
 *
 * @param projectName - Raw project name from directory path
 * @returns User-friendly project name with alias support
 *
 * @example
 * ```typescript
 * // Without aliases
 * formatProjectName('-Users-phaedrus-Development-occusage')
 * // → 'occusage'
 *
 * // With alias (when OCCUSAGE_PROJECT_ALIASES="occusage=Usage Tracker")
 * formatProjectName('-Users-phaedrus-Development-occusage')
 * // → 'Usage Tracker'
 * ```
 */
export function formatProjectName(projectName: string): string {
	// Check for custom alias first
	const aliases = getProjectAliases();
	if (aliases.has(projectName)) {
		return aliases.get(projectName)!;
	}

	// Parse the project name using improved logic
	const parsed = parseProjectName(projectName);

	// Check if parsed name has an alias
	if (aliases.has(parsed)) {
		return aliases.get(parsed)!;
	}

	return parsed;
}

/**
 * Get all configured project aliases
 * @returns Map of project names to their aliases
 */
export function getConfiguredAliases(): Map<string, string> {
	return new Map(getProjectAliases());
}

