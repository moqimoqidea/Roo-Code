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
						// Execute the tool directly on the original cline object
						// Import necessary functions from presentAssistantMessage
						const { formatResponse } = await import("../prompts/responses")
						const { validateToolUse } = await import("../tools/validateToolUse")
						const { defaultModeSlug } = await import("../../shared/modes")
						
						// Import tool functions
						const { readFileTool } = await import("../tools/readFileTool")
						const { writeToFileTool } = await import("../tools/writeToFileTool")
						const { listFilesTool } = await import("../tools/listFilesTool")
						const { searchFilesTool } = await import("../tools/searchFilesTool")
						const { executeCommandTool } = await import("../tools/executeCommandTool")
						const { searchAndReplaceTool } = await import("../tools/searchAndReplaceTool")
						const { insertContentTool } = await import("../tools/insertContentTool")
						const { attemptCompletionTool } = await import("../tools/attemptCompletionTool")
						const { askFollowupQuestionTool } = await import("../tools/askFollowupQuestionTool")
						
						// Create pushToolResult function
						const pushToolResult = (content: any) => {
							const toolResults: any[] = []
							
							if (typeof content === "string") {
								// Handle empty string as a valid result (used by attempt_completion)
								toolResults.push({ type: "text", text: content === "" ? "" : (content || "(tool did not return anything)") })
							} else {
								toolResults.push(...content)
							}
							
							return toolResults
						}
						
						// Create askApproval function
						const askApproval = async (
							type: any,
							partialMessage?: string,
							progressStatus?: any,
							isProtected?: boolean,
						) => {
							const { response, text, images } = await cline.ask(
								type,
								partialMessage,
								false,
								progressStatus,
								isProtected || false,
							)
							
							if (response !== "yesButtonClicked") {
								if (text) {
									await cline.say("user_feedback", text, images)
								}
								cline.didRejectTool = true
								return false
							}
							
							if (text) {
								await cline.say("user_feedback", text, images)
							}
							
							return true
						}
						
						// Create handleError function
						const handleError = async (action: string, error: Error) => {
							await cline.say(
								"error",
								`Error ${action}:\n${error.message}`,
							)
							// Push error result to toolResults array
							const errorResult = formatResponse.toolError(`Error ${action}: ${error.message}`)
							toolResults = pushToolResult(errorResult)
						}
						
						// Create removeClosingTag function
						const removeClosingTag = (tag: string, text?: string): string => {
							return text || ""
						}
						
						// Close browser if not browser_action
						if (toolUseBlock.name !== "browser_action") {
							await cline.browserSession.closeBrowser()
						}
						
						// Record tool usage
						if (!toolUseBlock.partial) {
							cline.recordToolUsage(toolUseBlock.name)
						}
						
						// Validate tool use
						const { mode, customModes } = (await cline.providerRef.deref()?.getState()) ?? {}
						
						try {
							validateToolUse(
								toolUseBlock.name as any,
								mode ?? defaultModeSlug,
								customModes ?? [],
								{ apply_diff: cline.diffEnabled },
								toolUseBlock.params,
							)
						} catch (error) {
							cline.consecutiveMistakeCount++
							const errorResult = formatResponse.toolError(error.message)
							const anthropicErrorResponse = convertXmlResultToAnthropicToolResponse(
								originalAnthropicToolUse.id,
								typeof errorResult === "string" ? errorResult : JSON.stringify(errorResult),
								true
							)
							cline.userMessageContent.push(anthropicErrorResponse as any)
							cline.didAlreadyUseTool = true
							return
						}
						
						// Execute the specific tool
						let toolResults: any[] = []
						
						switch (toolUseBlock.name) {
							case "read_file":
								await readFileTool(cline, toolUseBlock, askApproval, handleError, (content) => {
									toolResults = pushToolResult(content)
								}, removeClosingTag)
								break
							case "write_to_file":
								await writeToFileTool(cline, toolUseBlock, askApproval, handleError, (content) => {
									toolResults = pushToolResult(content)
								}, removeClosingTag)
								break
							case "list_files":
								await listFilesTool(cline, toolUseBlock, askApproval, handleError, (content) => {
									toolResults = pushToolResult(content)
								}, removeClosingTag)
								break
							case "search_files":
								await searchFilesTool(cline, toolUseBlock, askApproval, handleError, (content) => {
									toolResults = pushToolResult(content)
								}, removeClosingTag)
								break
							case "execute_command":
								await executeCommandTool(cline, toolUseBlock, askApproval, handleError, (content) => {
									toolResults = pushToolResult(content)
								}, removeClosingTag)
								break
							case "search_and_replace":
								await searchAndReplaceTool(cline, toolUseBlock, askApproval, handleError, (content) => {
									toolResults = pushToolResult(content)
								}, removeClosingTag)
								break
							case "insert_content":
								await insertContentTool(cline, toolUseBlock, askApproval, handleError, (content) => {
									toolResults = pushToolResult(content)
								}, removeClosingTag)
								break
							case "attempt_completion":
								// attempt_completion needs special handling for askFinishSubTaskApproval
								const askFinishSubTaskApproval = async () => {
									const toolMessage = JSON.stringify({ tool: "finishTask" })
									return await askApproval("tool", toolMessage)
								}
								const toolDescription = () => `[${toolUseBlock.name}]`
								await attemptCompletionTool(cline, toolUseBlock, askApproval, handleError, (content) => {
									toolResults = pushToolResult(content)
								}, removeClosingTag, toolDescription, askFinishSubTaskApproval)
								break
							case "ask_followup_question":
								await askFollowupQuestionTool(cline, toolUseBlock, askApproval, handleError, (content) => {
									toolResults = pushToolResult(content)
								}, removeClosingTag)
								break
							default:
								const errorMsg = `Tool ${toolUseBlock.name} not implemented in Anthropic native mode`
								toolResults = pushToolResult(formatResponse.toolError(errorMsg))
								break
						}
						
						// Convert tool results to Anthropic format
						let resultText = ""
						let isError = false
						
						for (const result of toolResults) {
							if (result.type === "text") {
								if (result.text.includes("Error")) {
									isError = true
								}
								resultText += result.text + "\n"
							}
						}
						
						// Convert to Anthropic tool response format
						const anthropicToolResponse = convertXmlResultToAnthropicToolResponse(
							originalAnthropicToolUse.id,
							resultText.trim(),
							isError
						)
						
						// Add to user content
						cline.userMessageContent.push(anthropicToolResponse as any)
						
						// Mark that we've used a tool to prevent multiple tool executions
						cline.didAlreadyUseTool = true
						
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
						cline.didAlreadyUseTool = true
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
					cline.didAlreadyUseTool = true
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
				cline.didAlreadyUseTool = true
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