import cloneDeep from "clone-deep"
import { Anthropic } from "@anthropic-ai/sdk"

import type { ToolName } from "@roo-code/types"

import { Task } from "../task/Task"
import { AnthropicToolUse } from "./parseAssistantMessage"
import { convertAnthropicToolUseToXml, convertXmlResultToAnthropicToolResponse } from "./anthropic-native"
import { parseAssistantMessage } from "./parseAssistantMessage"
import { presentAssistantMessage } from "./presentAssistantMessage"

/**
 * Processes and presents Anthropic native tool use messages for Claude Sonnet 4.
 * This function handles the conversion from Anthropic format to XML format,
 * executes tools using the existing infrastructure, and converts results back
 * to Anthropic format for the conversation history.
 */
export async function presentAnthropicAssistantMessage(cline: Task) {
	if (cline.abort) {
		throw new Error(`[Task#presentAnthropicAssistantMessage] task ${cline.taskId}.${cline.instanceId} aborted`)
	}

	if (cline.presentAssistantMessageLocked) {
		cline.presentAssistantMessageHasPendingUpdates = true
		return
	}

	cline.presentAssistantMessageLocked = true
	cline.presentAssistantMessageHasPendingUpdates = false

	if (cline.currentStreamingContentIndex >= cline.assistantMessageContent.length) {
		if (cline.didCompleteReadingStream) {
			cline.userMessageContentReady = true
		}
		cline.presentAssistantMessageLocked = false
		return
	}

	const block = cloneDeep(cline.assistantMessageContent[cline.currentStreamingContentIndex])

	switch (block.type) {
		case "text": {
			// Handle text content the same as the original function
			if (cline.didRejectTool || cline.didAlreadyUseTool) {
				break
			}

			let content = block.content
			if (content) {
				// Remove thinking tags and partial XML tags
				content = content.replace(/<thinking>\s?/g, "")
				content = content.replace(/\s?<\/thinking>/g, "")
				
				const lastOpenBracketIndex = content.lastIndexOf("<")
				if (lastOpenBracketIndex !== -1) {
					const possibleTag = content.slice(lastOpenBracketIndex)
					const hasCloseBracket = possibleTag.includes(">")
					
					if (!hasCloseBracket) {
						let tagContent: string
						if (possibleTag.startsWith("</")) {
							tagContent = possibleTag.slice(2).trim()
						} else {
							tagContent = possibleTag.slice(1).trim()
						}
						
						const isLikelyTagName = /^[a-zA-Z_]+$/.test(tagContent)
						const isOpeningOrClosing = possibleTag === "<" || possibleTag === "</"
						
						if (isOpeningOrClosing || isLikelyTagName) {
							content = content.slice(0, lastOpenBracketIndex).trim()
						}
					}
				}
			}

			await cline.say("text", content, undefined, block.partial)
			break
		}
		case "anthropic_tool_use": {
			if (cline.didRejectTool || cline.didAlreadyUseTool) {
				break
			}

			try {
				// Convert Anthropic tool use to XML format for execution
				const xmlContent = convertAnthropicToolUseToXml(block as AnthropicToolUse)
				
				// Parse the XML as if it came from the XML parsing logic
				const xmlContentBlocks = parseAssistantMessage(xmlContent)
				
				// Find the tool use block
				const toolUseBlock = xmlContentBlocks.find(b => b.type === "tool_use")
				
				if (toolUseBlock && toolUseBlock.type === "tool_use") {
					// Temporarily store original anthropic tool use info
					const originalAnthropicToolUse = block as AnthropicToolUse
					
					// Replace the current assistantMessageContent block with the XML version
					const originalBlock = cline.assistantMessageContent[cline.currentStreamingContentIndex]
					cline.assistantMessageContent[cline.currentStreamingContentIndex] = toolUseBlock
					
					// Set up custom handling for tool result
					const originalUserMessageContent = [...cline.userMessageContent]
					
					try {
						// Execute the tool directly instead of calling presentAssistantMessage
						// Create a new instance to avoid locking issues
						const tempCline = Object.create(cline)
						tempCline.presentAssistantMessageLocked = false
						tempCline.currentStreamingContentIndex = 0
						tempCline.assistantMessageContent = [toolUseBlock]
						tempCline.userMessageContent = []
						tempCline.didRejectTool = false
						tempCline.didAlreadyUseTool = false
						
						// Import the presentAssistantMessage function and execute
						const { presentAssistantMessage } = await import("./presentAssistantMessage")
						await presentAssistantMessage(tempCline)
						
						// After tool execution, convert result back to Anthropic format
						const toolResultContent = tempCline.userMessageContent
						
						// Find the tool result text
						let resultText = ""
						let isError = false
						
						for (const content of toolResultContent) {
							if (content.type === "text") {
								if (content.text.includes("Error")) {
									isError = true
								}
								resultText += content.text + "\n"
							}
						}
						
						// Convert to Anthropic tool response format and store in user content
						const anthropicToolResponse = convertXmlResultToAnthropicToolResponse(
							originalAnthropicToolUse.id,
							resultText.trim(),
							isError
						)
						
						// Add to original cline's user content
						cline.userMessageContent.push(anthropicToolResponse as any)
						
					} catch (toolError) {
						console.error("Error executing Anthropic tool use:", toolError)
						// Restore original block on error
						cline.assistantMessageContent[cline.currentStreamingContentIndex] = originalBlock
						
						// Add error to user content
						const errorResponse = convertXmlResultToAnthropicToolResponse(
							originalAnthropicToolUse.id,
							`Tool execution failed: ${toolError.message}`,
							true
						)
						
						cline.userMessageContent.push(errorResponse as any)
					}
					
					// Restore original block for display purposes
					cline.assistantMessageContent[cline.currentStreamingContentIndex] = originalBlock
				} else {
					console.error("Failed to parse XML tool use block from Anthropic tool use")
					// Handle fallback case
					const originalAnthropicToolUse = block as AnthropicToolUse
					const errorResponse = convertXmlResultToAnthropicToolResponse(
						originalAnthropicToolUse.id,
						"Failed to convert Anthropic tool use to XML format",
						true
					)
					
					cline.userMessageContent.push(errorResponse as any)
				}
			} catch (error) {
				console.error("Error handling Anthropic tool use:", error)
				// Fallback error handling
				const originalAnthropicToolUse = block as AnthropicToolUse
				const errorResponse = convertXmlResultToAnthropicToolResponse(
					originalAnthropicToolUse.id,
					`Unexpected error: ${error.message}`,
					true
				)
				
				cline.userMessageContent.push(errorResponse as any)
			}
			
			break
		}
		case "tool_use": {
			// This shouldn't happen in Claude Sonnet 4 mode, but handle it gracefully
			await presentAssistantMessage(cline)
			return
		}
	}

	// Continue with the rest of the presentation logic
	cline.presentAssistantMessageLocked = false

	if (!block.partial || cline.didRejectTool || cline.didAlreadyUseTool) {
		if (cline.currentStreamingContentIndex === cline.assistantMessageContent.length - 1) {
			cline.userMessageContentReady = true
		}

		cline.currentStreamingContentIndex++

		if (cline.currentStreamingContentIndex < cline.assistantMessageContent.length) {
			presentAnthropicAssistantMessage(cline)
			return
		}
	}

	if (cline.presentAssistantMessageHasPendingUpdates) {
		presentAnthropicAssistantMessage(cline)
	}
}