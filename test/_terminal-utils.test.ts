import { describe, it, expect } from 'vitest';
import { drawEmoji } from '../src/_terminal-utils.ts';
import stringWidth from 'string-width';

describe('drawEmoji', () => {
	it('should always return a string with width as same as original', () => {
		// 2-width emojis
		expect(stringWidth(drawEmoji('⏱️'))).toBe(2);
		expect(stringWidth(drawEmoji('🔥'))).toBe(2);
		expect(stringWidth(drawEmoji('📈'))).toBe(2);
		expect(stringWidth(drawEmoji('⚙️'))).toBe(2);
		expect(stringWidth(drawEmoji('❌'))).toBe(2);
		expect(stringWidth(drawEmoji('⚠️'))).toBe(2);
		expect(stringWidth(drawEmoji('⚡'))).toBe(2);

		// 1-width emojis
		expect(stringWidth(drawEmoji('✓'))).toBe(1);
		expect(stringWidth(drawEmoji('↻'))).toBe(1);
	});
});