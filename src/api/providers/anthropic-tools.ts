import type { ToolName, ModeConfig } from "@roo-code/types"

import { TOOL_GROUPS, ALWAYS_AVAILABLE_TOOLS } from "../../shared/tools"
import { Mode, getModeConfig, isToolAllowedForMode, getGroupName } from "../../shared/modes"

/**
 * Convert tools available for a mode into Anthropic's structured tool format
 */
export function getAnthropicToolsForMode(
	mode: Mode,
	customModes?: ModeConfig[],
	experiments?: Record<string, boolean>,
): any[] {
	const config = getModeConfig(mode, customModes)
	const tools = new Set<string>()

	// Add tools from mode's groups
	config.groups.forEach((groupEntry) => {
		const groupName = getGroupName(groupEntry)
		const toolGroup = TOOL_GROUPS[groupName]
		if (toolGroup) {
			toolGroup.tools.forEach((tool) => {
				if (
					isToolAllowedForMode(
						tool as ToolName,
						mode,
						customModes ?? [],
						undefined,
						undefined,
						experiments ?? {},
					)
				) {
					tools.add(tool)
				}
			})
		}
	})

	// Add always available tools
	ALWAYS_AVAILABLE_TOOLS.forEach((tool) => tools.add(tool))

	// Convert to Anthropic tool format
	return Array.from(tools).map((toolName) => convertToAnthropicTool(toolName))
}

/**
 * Convert individual tool to Anthropic format
 * This is a basic conversion - in the future this could be enhanced
 * to parse the existing text descriptions and extract more detailed schemas
 */
function convertToAnthropicTool(toolName: string): any {
	// Define basic tool schemas for common tools
	const toolSchemas: Record<string, any> = {
		read_file: {
			name: "read_file",
			description: "Read the contents of a file at the specified path",
			input_schema: {
				type: "object",
				properties: {
					path: {
						type: "string",
						description: "The path of the file to read (relative to current workspace directory)"
					},
					start_line: {
						type: "number",
						description: "Starting line number to read from (1-based, optional)"
					},
					end_line: {
						type: "number", 
						description: "Ending line number to read to (1-based, inclusive, optional)"
					}
				},
				required: ["path"]
			}
		},
		write_to_file: {
			name: "write_to_file",
			description: "Write content to a file, creating or overwriting as needed",
			input_schema: {
				type: "object",
				properties: {
					path: {
						type: "string",
						description: "The path of the file to write to (relative to current workspace directory)"
					},
					content: {
						type: "string",
						description: "The content to write to the file"
					},
					line_count: {
						type: "number",
						description: "The number of lines in the file"
					}
				},
				required: ["path", "content", "line_count"]
			}
		},
		execute_command: {
			name: "execute_command",
			description: "Execute a command in the system shell",
			input_schema: {
				type: "object",
				properties: {
					command: {
						type: "string",
						description: "The command to execute"
					},
					cwd: {
						type: "string",
						description: "The working directory to execute the command in (optional)"
					}
				},
				required: ["command"]
			}
		},
		search_files: {
			name: "search_files",
			description: "Search for files in the workspace",
			input_schema: {
				type: "object",
				properties: {
					path: {
						type: "string",
						description: "The path to search in"
					},
					file_pattern: {
						type: "string",
						description: "File pattern to search for"
					},
					recursive: {
						type: "boolean",
						description: "Whether to search recursively"
					}
				},
				required: ["path", "file_pattern"]
			}
		},
		list_files: {
			name: "list_files",
			description: "List files in a directory",
			input_schema: {
				type: "object",
				properties: {
					path: {
						type: "string",
						description: "The path to list files from"
					},
					recursive: {
						type: "boolean",
						description: "Whether to list files recursively"
					}
				},
				required: ["path"]
			}
		},
		ask_followup_question: {
			name: "ask_followup_question",
			description: "Ask a follow-up question to the user",
			input_schema: {
				type: "object",
				properties: {
					question: {
						type: "string",
						description: "The question to ask the user"
					}
				},
				required: ["question"]
			}
		},
		attempt_completion: {
			name: "attempt_completion",
			description: "Indicate that the task has been completed",
			input_schema: {
				type: "object",
				properties: {
					result: {
						type: "string",
						description: "A summary of what was accomplished"
					},
					command: {
						type: "string",
						description: "A command to run to demonstrate the result (optional)"
					}
				},
				required: ["result"]
			}
		},
		switch_mode: {
			name: "switch_mode",
			description: "Switch to a different mode",
			input_schema: {
				type: "object",
				properties: {
					mode_slug: {
						type: "string",
						description: "The slug of the mode to switch to"
					},
					reason: {
						type: "string",
						description: "The reason for switching modes (optional)"
					}
				},
				required: ["mode_slug"]
			}
		},
		new_task: {
			name: "new_task", 
			description: "Create a new task in a specific mode",
			input_schema: {
				type: "object",
				properties: {
					mode: {
						type: "string",
						description: "The mode to create the new task in"
					},
					message: {
						type: "string",
						description: "The message/instruction for the new task"
					}
				},
				required: ["mode", "message"]
			}
		}
	}

	// Return the predefined schema if available, otherwise a generic schema
	const schema = toolSchemas[toolName]
	if (schema) {
		return schema
	}

	// Generic fallback for unknown tools
	return {
		name: toolName,
		description: `Tool: ${toolName}`,
		input_schema: {
			type: "object",
			properties: {},
			required: []
		}
	}
}
