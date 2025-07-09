import { AnthropicToolUse } from "./parseAssistantMessage"

/**
 * Validates that an Anthropic tool use has all required fields
 */
export function validateAnthropicToolUse(toolUse: any): toolUse is AnthropicToolUse {
	return (
		toolUse &&
		typeof toolUse === 'object' &&
		toolUse.type === 'anthropic_tool_use' &&
		typeof toolUse.id === 'string' &&
		typeof toolUse.name === 'string' &&
		typeof toolUse.input === 'object' &&
		typeof toolUse.partial === 'boolean'
	)
}

/**
 * Validates that a tool use ID is valid
 */
export function validateToolUseId(id: string): boolean {
	return typeof id === 'string' && id.length > 0
}

/**
 * Validates that tool input is valid JSON object
 */
export function validateToolInput(input: any): boolean {
	try {
		if (typeof input !== 'object' || input === null) {
			return false
		}
		// Try to serialize and deserialize to ensure it's valid JSON
		JSON.stringify(input)
		return true
	} catch {
		return false
	}
}

/**
 * Sanitizes tool name to ensure it's valid for XML conversion
 */
export function sanitizeToolName(name: string): string {
	// Remove any characters that might cause issues in XML
	return name.replace(/[^a-zA-Z0-9_-]/g, '_')
}

/**
 * Checks if the system is properly configured for Claude Sonnet 4
 */
export function validateClaudeSonnet4Configuration(apiProvider?: string, apiModelId?: string): boolean {
	return apiProvider === "anthropic" && apiModelId === "claude-sonnet-4-20250514"
}