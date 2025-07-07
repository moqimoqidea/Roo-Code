export const EXTEND_ANTHROPIC_TOOLS = [
	{
		name: "read_file",
		description:
			'Request to read the contents of one or more files. The tool outputs line-numbered content (e.g. "1 | const x = 1") for easy reference when creating diffs or discussing code. Supports text extraction from PDF and DOCX files, but may not handle other binary files properly.\n\nIMPORTANT: You can read a maximum of 5 files in a single request. If you need to read more files, use multiple sequential read_file requests.\n\nIMPORTANT: You MUST use this Efficient Reading Strategy:\n- You MUST read all related files and implementations together in a single operation (up to 5 files at once)\n- You MUST obtain all necessary context before proceeding with changes\n- When you need to read more than 5 files, prioritize the most critical files first, then use subsequent read_file requests for additional files.',
		input_schema: {
			type: "object",
			properties: {
				args: {
					type: "array",
					description:
						"A list of file objects to read. Each object must contain a 'path'. A maximum of 5 files can be read at once.",
					items: {
						type: "object",
						properties: {
							path: {
								type: "string",
								description: "File path (relative to workspace directory)",
							},
						},
						required: ["path"],
					},
				},
			},
			required: ["args"],
			additionalProperties: false,
			$schema: "http://json-schema.org/draft-07/schema#",
		},
	},
	{
		name: "fetch_instructions",
		description: "Request to fetch instructions to perform a task.",
		input_schema: {
			type: "object",
			properties: {
				task: {
					type: "string",
					description: "The task to get instructions for.",
					enum: ["create_mcp_server", "create_mode"],
				},
			},
			required: ["task"],
			additionalProperties: false,
			$schema: "http://json-schema.org/draft-07/schema#",
		},
	},
	{
		name: "search_files",
		description:
			"Request to perform a regex search across files in a specified directory, providing context-rich results. This tool searches for patterns or specific content across multiple files, displaying each match with encapsulating context.",
		input_schema: {
			type: "object",
			properties: {
				path: {
					type: "string",
					description:
						"The path of the directory to search in (relative to the current workspace directory). This directory will be recursively searched.",
				},
				regex: {
					type: "string",
					description: "The regular expression pattern to search for. Uses Rust regex syntax.",
				},
				file_pattern: {
					type: "string",
					description:
						"Optional glob pattern to filter files (e.g., '*.ts' for TypeScript files). If not provided, it will search all files (*).",
				},
			},
			required: ["path", "regex"],
			additionalProperties: false,
			$schema: "http://json-schema.org/draft-07/schema#",
		},
	},
	{
		name: "list_files",
		description:
			"Request to list files and directories within the specified directory. If recursive is true, it will list all files and directories recursively. If recursive is false or not provided, it will only list the top-level contents. Do not use this tool to confirm the existence of files you may have created, as the user will let you know if the files were created successfully or not.",
		input_schema: {
			type: "object",
			properties: {
				path: {
					type: "string",
					description:
						"The path of the directory to list contents for (relative to the current workspace directory).",
				},
				recursive: {
					type: "boolean",
					description:
						"Whether to list files recursively. Use true for recursive listing, false or omit for top-level only.",
				},
			},
			required: ["path"],
			additionalProperties: false,
			$schema: "http://json-schema.org/draft-07/schema#",
		},
	},
	{
		name: "list_code_definition_names",
		description:
			"Request to list definition names (classes, functions, methods, etc.) from source code. This tool can analyze either a single file or all files at the top level of a specified directory. It provides insights into the codebase structure and important constructs, encapsulating high-level concepts and relationships that are crucial for understanding the overall architecture.",
		input_schema: {
			type: "object",
			properties: {
				path: {
					type: "string",
					description:
						"The path of the file or directory (relative to the current working directory) to analyze. When given a directory, it lists definitions from all top-level source files.",
				},
			},
			required: ["path"],
			additionalProperties: false,
			$schema: "http://json-schema.org/draft-07/schema#",
		},
	},
	{
		name: "apply_diff",
		description:
			"Request to apply targeted modifications to an existing file by searching for specific sections of content and replacing them. This tool is ideal for precise, surgical edits when you know the exact content to change. It helps maintain proper indentation and formatting. You can perform multiple distinct search and replace operations within a single `apply_diff` call by providing multiple SEARCH/REPLACE blocks in the `diff` parameter. This is the preferred way to make several targeted changes to one file efficiently. The SEARCH section must exactly match existing content including whitespace and indentation. If you're not confident in the exact content to search for, use the read_file tool first to get the exact content. When applying the diffs, be extra careful to remember to change any closing brackets or other syntax that may be affected by the diff farther down in the file. ALWAYS make as many changes in a single 'apply_diff' request as possible using multiple SEARCH/REPLACE blocks.",
		input_schema: {
			type: "object",
			properties: {
				path: {
					type: "string",
					description:
						"The path of the file to modify (relative to the current workspace directory /Users/moqi/Desktop).",
				},
				diff: {
					type: "string",
					description:
						"The search/replace block defining the changes. Format:\n<<<<<<< SEARCH\n:start_line: (required) The line number of original content where the search block starts.\n-------\n[exact content to find including whitespace]\n=======\n[new content to replace with]\n>>>>>>> REPLACE\n\nYou can use multi search/replace block in one diff block, but make sure to include the start line numbers for each block.",
				},
			},
			required: ["path", "diff"],
			additionalProperties: false,
			$schema: "http://json-schema.org/draft-07/schema#",
		},
	},
	{
		name: "write_to_file",
		description:
			"Request to write content to a file. This tool is primarily used for **creating new files** or for scenarios where a **complete rewrite of an existing file is intentionally required**. If the file exists, it will be overwritten. If it doesn't exist, it will be created. This tool will automatically create any directories needed to write the file.",
		input_schema: {
			type: "object",
			properties: {
				path: {
					type: "string",
					description:
						"The path of the file to write to (relative to the current workspace directory /Users/moqi/Desktop).",
				},
				content: {
					type: "string",
					description:
						"The content to write to the file. When performing a full rewrite of an existing file or creating a new one, ALWAYS provide the COMPLETE intended content of the file, without any truncation or omissions. You MUST include ALL parts of the file, even if they haven't been modified. Do NOT include the line numbers in the content, just the actual content of the file.",
				},
				line_count: {
					type: "integer",
					description:
						"The total number of lines in the file, including empty lines. Compute this based on the actual content being written.",
				},
			},
			required: ["path", "content", "line_count"],
			additionalProperties: false,
			$schema: "http://json-schema.org/draft-07/schema#",
		},
	},
	{
		name: "insert_content",
		description:
			"Use this tool specifically for adding new lines of content into a file without modifying existing content. Specify the line number to insert before, or use line 0 to append to the end. Ideal for adding imports, functions, configuration blocks, log entries, or any multi-line text block.",
		input_schema: {
			type: "object",
			properties: {
				path: {
					type: "string",
					description: "File path relative to workspace directory /Users/moqi/Desktop.",
				},
				line: {
					type: "integer",
					description:
						"Line number where content will be inserted (1-based). Use 0 to append at the end of the file. Use any positive number to insert before that line.",
				},
				content: {
					type: "string",
					description: "The content to insert at the specified line.",
				},
			},
			required: ["path", "line", "content"],
			additionalProperties: false,
			$schema: "http://json-schema.org/draft-07/schema#",
		},
	},
	{
		name: "search_and_replace",
		description:
			"Use this tool to find and replace specific text strings or patterns (using regex) within a file. It's suitable for targeted replacements across multiple locations within the file. Supports literal text and regex patterns, case sensitivity options, and optional line ranges. Shows a diff preview before applying changes.\nNotes:\n- When use_regex is true, the search parameter is treated as a regular expression pattern.\n- When ignore_case is true, the search is case-insensitive regardless of regex mode.",
		input_schema: {
			type: "object",
			properties: {
				path: {
					type: "string",
					description:
						"The path of the file to modify (relative to the current workspace directory /Users/moqi/Desktop).",
				},
				search: {
					type: "string",
					description: "The text or regex pattern to search for.",
				},
				replace: {
					type: "string",
					description: "The text to replace matches with.",
				},
				start_line: {
					type: "integer",
					description: "Optional: Starting line number for restricted replacement (1-based).",
				},
				end_line: {
					type: "integer",
					description: "Optional: Ending line number for restricted replacement (1-based).",
				},
				use_regex: {
					type: "boolean",
					description:
						"Optional: Set to true to treat the 'search' parameter as a regex pattern (default: false).",
				},
				ignore_case: {
					type: "boolean",
					description: "Optional: Set to true to ignore case when matching (default: false).",
				},
			},
			required: ["path", "search", "replace"],
			additionalProperties: false,
			$schema: "http://json-schema.org/draft-07/schema#",
		},
	},
	{
		name: "browser_action",
		description:
			"Request to interact with a Puppeteer-controlled browser. Every action, except `close`, will be responded to with a screenshot of the browser's current state, along with any new console logs. You may only perform one browser action per message, and wait for the user's response including a screenshot and logs to determine the next action.\n- The sequence of actions must always start with launching the browser at a URL, and must always end with closing the browser. If you need to visit a new URL that is not possible to navigate to from the current webpage, you must first close the browser, then launch again at the new URL.\n- While the browser is active, only the `browser_action` tool can be used. No other tools should be called during this time. You may proceed to use other tools only after closing the browser. For example if you run into an error and need to fix a file, you must close the browser, then use other tools to make the necessary changes, then re-launch the browser to verify the result.\n- The browser window has a resolution of 900x600 pixels. When performing any click actions, ensure the coordinates are within this resolution range.\n- Before clicking on any elements such as icons, links, or buttons, you must consult the provided screenshot of the page to determine the coordinates of the element. The click should be targeted at the center of the element, not on its edges.",
		input_schema: {
			type: "object",
			properties: {
				action: {
					type: "string",
					description: "The action to perform.",
					enum: ["launch", "hover", "click", "type", "resize", "scroll_down", "scroll_up", "close"],
				},
				url: {
					type: "string",
					description:
						"The URL for the 'launch' action (e.g. http://localhost:3000, file:///path/to/file.html).",
				},
				coordinate: {
					type: "string",
					description: "The X,Y coordinates (e.g., '450,300') for the 'click' and 'hover' actions.",
				},
				size: {
					type: "string",
					description: "The width,height (e.g., '1280,720') for the 'resize' action.",
				},
				text: {
					type: "string",
					description: "The text for the 'type' action.",
				},
			},
			required: ["action"],
			additionalProperties: false,
			$schema: "http://json-schema.org/draft-07/schema#",
		},
	},
	{
		name: "execute_command",
		description:
			"Request to execute a CLI command on the system. Use this when you need to perform system operations or run specific commands to accomplish any step in the user's task. You must tailor your command to the user's system and provide a clear explanation of what the command does. For command chaining, use the appropriate chaining syntax for the user's shell. Prefer to execute complex CLI commands over creating executable scripts, as they are more flexible and easier to run. Prefer relative commands and paths that avoid location sensitivity for terminal consistency, e.g: `touch ./testdata/example.file`, `dir ./examples/model1/data/yaml`, or `go test ./cmd/front --config ./cmd/front/config.yml`. If directed by the user, you may open a terminal in a different directory by using the `cwd` parameter.",
		input_schema: {
			type: "object",
			properties: {
				command: {
					type: "string",
					description:
						"The CLI command to execute. This should be valid for the current operating system. Ensure the command is properly formatted and does not contain any harmful instructions.",
				},
				cwd: {
					type: "string",
					description:
						"Optional: The working directory to execute the command in (default: /Users/moqi/Desktop).",
				},
			},
			required: ["command"],
			additionalProperties: false,
			$schema: "http://json-schema.org/draft-07/schema#",
		},
	},
	{
		name: "use_mcp_tool",
		description:
			"Request to use a tool provided by a connected MCP server. Each MCP server can provide multiple tools with different capabilities. Tools have defined input schemas that specify required and optional parameters.",
		input_schema: {
			type: "object",
			properties: {
				server_name: {
					type: "string",
					description: "The name of the MCP server providing the tool.",
				},
				tool_name: {
					type: "string",
					description: "The name of the tool to execute.",
				},
				arguments: {
					type: "object",
					description:
						"A JSON object containing the tool's input parameters, following the tool's input schema.",
					additionalProperties: true,
				},
			},
			required: ["server_name", "tool_name", "arguments"],
			additionalProperties: false,
			$schema: "http://json-schema.org/draft-07/schema#",
		},
	},
	{
		name: "access_mcp_resource",
		description:
			"Request to access a resource provided by a connected MCP server. Resources represent data sources that can be used as context, such as files, API responses, or system information.",
		input_schema: {
			type: "object",
			properties: {
				server_name: {
					type: "string",
					description: "The name of the MCP server providing the resource.",
				},
				uri: {
					type: "string",
					description: "The URI identifying the specific resource to access.",
				},
			},
			required: ["server_name", "uri"],
			additionalProperties: false,
			$schema: "http://json-schema.org/draft-07/schema#",
		},
	},
	{
		name: "ask_followup_question",
		description:
			"Ask the user a question to gather additional information needed to complete the task. This tool should be used when you encounter ambiguities, need clarification, or require more details to proceed effectively. It allows for interactive problem-solving by enabling direct communication with the user. Use this tool judiciously to maintain a balance between gathering necessary information and avoiding excessive back-and-forth.",
		input_schema: {
			type: "object",
			properties: {
				question: {
					type: "string",
					description:
						"The question to ask the user. This should be a clear, specific question that addresses the information you need.",
				},
				follow_up: {
					type: "array",
					description:
						"A list of 2-4 suggested answers that logically follow from the question. Each suggestion should be specific, actionable, and a complete answer.",
					items: {
						type: "object",
						properties: {
							suggest: {
								type: "string",
								description: "The suggestion text. Must be a complete answer without placeholders.",
							},
							mode: {
								type: "string",
								description: "Optional mode slug to switch to when this suggestion is selected.",
							},
						},
						required: ["suggest"],
					},
				},
			},
			required: ["question", "follow_up"],
			additionalProperties: false,
			$schema: "http://json-schema.org/draft-07/schema#",
		},
	},
	{
		name: "attempt_completion",
		description:
			"After each tool use, the user will respond with the result of that tool use, i.e. if it succeeded or failed, along with any reasons for failure. Once you've received the results of tool uses and can confirm that the task is complete, use this tool to present the result of your work to the user. The user may respond with feedback if they are not satisfied with the result, which you can use to make improvements and try again.\nIMPORTANT NOTE: This tool CANNOT be used until you've confirmed from the user that any previous tool uses were successful. Failure to do so will result in code corruption and system failure. Before using this tool, you must ask yourself if you've confirmed from the user that any previous tool uses were successful. If not, then DO NOT use this tool.",
		input_schema: {
			type: "object",
			properties: {
				result: {
					type: "string",
					description:
						"The result of the task. Formulate this result in a way that is final and does not require further input from the user. Don't end your result with questions or offers for further assistance.",
				},
			},
			required: ["result"],
			additionalProperties: false,
			$schema: "http://json-schema.org/draft-07/schema#",
		},
	},
	{
		name: "switch_mode",
		description:
			"Request to switch to a different mode. This tool allows modes to request switching to another mode when needed, such as switching to Code mode to make code changes. The user must approve the mode switch.",
		input_schema: {
			type: "object",
			properties: {
				mode_slug: {
					type: "string",
					description: 'The slug of the mode to switch to (e.g., "code", "ask", "architect").',
				},
				reason: {
					type: "string",
					description: "The reason for switching modes.",
				},
			},
			required: ["mode_slug"],
			additionalProperties: false,
			$schema: "http://json-schema.org/draft-07/schema#",
		},
	},
	{
		name: "new_task",
		description: "This will let you create a new task instance in the chosen mode using your provided message.",
		input_schema: {
			type: "object",
			properties: {
				mode: {
					type: "string",
					description: 'The slug of the mode to start the new task in (e.g., "code", "debug", "architect").',
				},
				message: {
					type: "string",
					description: "The initial user message or instructions for this new task.",
				},
			},
			required: ["mode", "message"],
			additionalProperties: false,
			$schema: "http://json-schema.org/draft-07/schema#",
		},
	},
]
