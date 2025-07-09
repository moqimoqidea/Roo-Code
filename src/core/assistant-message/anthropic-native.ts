import { Anthropic } from "@anthropic-ai/sdk"
import { type ToolName } from "@roo-code/types"

import { TextContent } from "../../shared/tools"
import { AssistantMessageContent, AnthropicToolUse } from "./parseAssistantMessage"
import { validateAnthropicToolUse, validateToolUseId, validateToolInput, sanitizeToolName } from "./validation"

export interface AnthropicToolUseChunk {
	type: "anthropic_tool_use"
	id: string
	name: string
	input: Record<string, any>
}

export interface AnthropicToolUseDelta {
	type: "anthropic_tool_use_delta"
	partial_json: string
}

/**
 * Parses assistant message for Claude Sonnet 4 with native Anthropic tool use format
 */
export function parseAnthropicAssistantMessage(
	textMessage: string,
	toolUseChunks: AnthropicToolUseChunk[] = []
): AssistantMessageContent[] {
	const contentBlocks: AssistantMessageContent[] = []

	// Add text content if present
	if (textMessage.trim()) {
		contentBlocks.push({
			type: "text",
			content: textMessage.trim(),
			partial: false,
		} as TextContent)
	}

	// Add tool use blocks
	for (const chunk of toolUseChunks) {
		contentBlocks.push({
			type: "anthropic_tool_use",
			id: chunk.id,
			name: chunk.name,
			input: chunk.input,
			partial: false,
		} as AnthropicToolUse)
	}

	return contentBlocks
}

/**
 * Converts Anthropic native tool use to XML format for execution
 */
export function convertAnthropicToolUseToXml(toolUse: AnthropicToolUse): string {
	try {
		const { name, input } = toolUse
		
		console.log(`[convertAnthropicToolUseToXml] Converting tool: ${name}, input:`, input)
		
		let xmlContent = `<${name}>\n`
		
		// Handle special case where input has 'args' array
		if (input.args && Array.isArray(input.args)) {
			console.log(`[convertAnthropicToolUseToXml] Found args array with ${input.args.length} items`)
			
			// Create proper nested XML structure for tools that expect <args><file>...</file></args>
			xmlContent += `<args>\n`
			
			for (const arg of input.args) {
				// Wrap each argument object in a <file> tag for tools like read_file
				xmlContent += `<file>\n`
				for (const [key, value] of Object.entries(arg)) {
					if (typeof value === 'string') {
						xmlContent += `<${key}>${value}</${key}>\n`
					} else if (value !== null && value !== undefined) {
						xmlContent += `<${key}>${JSON.stringify(value)}</${key}>\n`
					}
				}
				xmlContent += `</file>\n`
			}
			
			xmlContent += `</args>\n`
		} else {
			console.log(`[convertAnthropicToolUseToXml] Processing direct input parameters`)
			
			// Handle normal key-value pairs
			for (const [key, value] of Object.entries(input)) {
				if (typeof value === 'string') {
					xmlContent += `<${key}>\n${value}\n</${key}>\n`
				} else if (Array.isArray(value)) {
					// Handle arrays by creating multiple tags with same name
					for (const item of value) {
						if (typeof item === 'string') {
							xmlContent += `<${key}>\n${item}\n</${key}>\n`
						} else {
							xmlContent += `<${key}>\n${JSON.stringify(item, null, 2)}\n</${key}>\n`
						}
					}
				} else if (value !== null && value !== undefined) {
					xmlContent += `<${key}>\n${JSON.stringify(value, null, 2)}\n</${key}>\n`
				}
			}
		}
		
		xmlContent += `</${name}>`
		
		console.log(`[convertAnthropicToolUseToXml] Generated XML:`, xmlContent)
		
		return xmlContent
	} catch (error) {
		console.error("Error converting Anthropic tool use to XML:", error)
		return `<error>\nFailed to convert tool use: ${error.message}\n</error>`
	}
}

/**
 * Converts tool execution result back to Anthropic tool response format
 */
export function convertXmlResultToAnthropicToolResponse(
	toolUseId: string,
	result: string,
	isError: boolean = false
): Anthropic.ToolResultBlockParam {
	try {
		return {
			type: "tool_result",
			tool_use_id: toolUseId,
			content: result || "",
			is_error: isError,
		}
	} catch (error) {
		console.error("Error converting XML result to Anthropic format:", error)
		return {
			type: "tool_result",
			tool_use_id: toolUseId,
			content: `Error converting result: ${error.message}`,
			is_error: true,
		}
	}
}

/**
 * State management for accumulating tool use data from streaming
 */
export class AnthropicToolUseAccumulator {
	private pendingToolUses: Map<string, {
		id: string
		name: string
		inputJson: string
		completed: boolean
	}> = new Map()

	addToolUseStart(id: string, name: string, input: Record<string, any>): void {
		if (!validateToolUseId(id)) {
			console.error(`Invalid tool use ID: ${id}`)
			return
		}
		
		if (!validateToolInput(input)) {
			console.error(`Invalid tool input for ${id}:`, input)
			return
		}
		
		const sanitizedName = sanitizeToolName(name)
		if (sanitizedName !== name) {
			console.warn(`Tool name sanitized from '${name}' to '${sanitizedName}'`)
		}
		
		// Check if input is empty object (common for Claude Sonnet 4 streaming)
		const isEmptyInput = Object.keys(input).length === 0
		
		this.pendingToolUses.set(id, {
			id,
			name: sanitizedName,
			inputJson: isEmptyInput ? "" : JSON.stringify(input),
			completed: false,
		})
		
		console.log(`[AnthropicToolUseAccumulator] Started tool use ${id} with ${isEmptyInput ? 'empty' : 'initial'} input`)
	}

	addToolUseDelta(id: string, partialJson: string): void {
		const existing = this.pendingToolUses.get(id)
		if (existing && !existing.completed) {
			const prevLength = existing.inputJson.length
			existing.inputJson += partialJson
			console.log(`[AnthropicToolUseAccumulator] Added delta to ${id}: "${partialJson}" (total length: ${prevLength} → ${existing.inputJson.length})`)
		}
	}

	completeToolUse(id: string): AnthropicToolUseChunk | null {
		const toolUse = this.pendingToolUses.get(id)
		if (!toolUse) return null

		try {
			console.log(`[AnthropicToolUseAccumulator] Completing tool use ${id} with JSON: "${toolUse.inputJson}"`)
			const input = JSON.parse(toolUse.inputJson)
			toolUse.completed = true
			
			console.log(`[AnthropicToolUseAccumulator] Successfully parsed JSON for ${id}:`, input)
			
			return {
				type: "anthropic_tool_use",
				id: toolUse.id,
				name: toolUse.name,
				input,
			}
		} catch (error) {
			console.error(`[AnthropicToolUseAccumulator] Failed to parse JSON for ${id}:`, error)
			console.error(`[AnthropicToolUseAccumulator] Problematic JSON: "${toolUse.inputJson}"`)
			return null
		}
	}

	getCompletedToolUses(): AnthropicToolUseChunk[] {
		const completed: AnthropicToolUseChunk[] = []
		
		for (const [id, toolUse] of this.pendingToolUses.entries()) {
			if (toolUse.completed) {
				try {
					const input = JSON.parse(toolUse.inputJson)
					completed.push({
						type: "anthropic_tool_use",
						id: toolUse.id,
						name: toolUse.name,
						input,
					})
				} catch (error) {
					console.error(`Failed to parse completed tool use ${id}:`, error)
				}
			}
		}
		
		return completed
	}

	clear(): void {
		this.pendingToolUses.clear()
	}

	hasPendingToolUses(): boolean {
		return Array.from(this.pendingToolUses.values()).some(tu => !tu.completed)
	}
}