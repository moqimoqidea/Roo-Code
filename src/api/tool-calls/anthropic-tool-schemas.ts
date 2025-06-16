import { Anthropic } from "@anthropic-ai/sdk"
import { ToolName } from "@roo-code/types"
import { TOOL_DISPLAY_NAMES } from "../../shared/tools"

/**
 * A mapping of tool names to their Anthropic-compatible JSON schemas
 */
export const ANTHROPIC_TOOL_SCHEMAS: Record<ToolName, Anthropic.Tool> = {
  execute_command: {
    name: "execute_command",
    description: "Run commands in the terminal",
    input_schema: {
      type: "object",
      properties: {
        command: {
          type: "string",
          description: "The command to execute"
        },
        cwd: {
          type: "string",
          description: "The working directory (optional)"
        }
      },
      required: ["command"]
    }
  },
  read_file: {
    name: "read_file",
    description: "Read the contents of a file",
    input_schema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "The path to the file to read"
        },
        start_line: {
          type: "string",
          description: "The line number to start reading from (optional)"
        },
        end_line: {
          type: "string",
          description: "The line number to end reading at (optional)"
        },
        args: {
          type: "string",
          description: "XML formatted arguments for multi-file reading (optional)"
        }
      },
      required: ["path"]
    }
  },
  fetch_instructions: {
    name: "fetch_instructions",
    description: "Fetch instructions for a given task",
    input_schema: {
      type: "object",
      properties: {
        task: {
          type: "string",
          description: "The task to fetch instructions for"
        }
      },
      required: ["task"]
    }
  },
  write_to_file: {
    name: "write_to_file",
    description: "Write content to a file",
    input_schema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "The path to the file to write"
        },
        content: {
          type: "string",
          description: "The content to write to the file"
        },
        line_count: {
          type: "string",
          description: "Number of lines (optional)"
        }
      },
      required: ["path", "content"]
    }
  },
  apply_diff: {
    name: "apply_diff",
    description: "Apply changes to a file",
    input_schema: {
      type: "object",
      properties: {
        diff: {
          type: "string",
          description: "The changes to apply to the file"
        }
      },
      required: ["diff"]
    }
  },
  insert_content: {
    name: "insert_content",
    description: "Insert content at a specific line in a file",
    input_schema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "The path to the file to modify"
        },
        line: {
          type: "string",
          description: "The line number to insert content at"
        },
        content: {
          type: "string",
          description: "The content to insert"
        }
      },
      required: ["path", "line", "content"]
    }
  },
  search_files: {
    name: "search_files",
    description: "Search for files matching a pattern",
    input_schema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "The directory to search in (optional)"
        },
        regex: {
          type: "string",
          description: "Regular expression to match file content"
        },
        file_pattern: {
          type: "string",
          description: "Pattern to match file names (optional)"
        }
      },
      required: ["regex"]
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
          description: "The directory to list files from"
        },
        recursive: {
          type: "string",
          description: "Whether to recursively list files (optional)"
        }
      },
      required: ["path"]
    }
  },
  list_code_definition_names: {
    name: "list_code_definition_names",
    description: "List code definitions in a file",
    input_schema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "The path to the file to analyze"
        }
      },
      required: ["path"]
    }
  },
  browser_action: {
    name: "browser_action",
    description: "Perform an action in the browser",
    input_schema: {
      type: "object",
      properties: {
        action: {
          type: "string",
          description: "The action to perform"
        },
        url: {
          type: "string",
          description: "The URL to navigate to (optional)"
        },
        coordinate: {
          type: "string",
          description: "Coordinates for click actions (optional)"
        },
        text: {
          type: "string",
          description: "Text for input actions (optional)"
        },
        size: {
          type: "string",
          description: "Size parameters (optional)"
        }
      },
      required: ["action"]
    }
  },
  use_mcp_tool: {
    name: "use_mcp_tool",
    description: "Use an MCP tool",
    input_schema: {
      type: "object",
      properties: {
        server_name: {
          type: "string",
          description: "The name of the MCP server"
        },
        tool_name: {
          type: "string",
          description: "The name of the tool to use"
        },
        arguments: {
          type: "string",
          description: "The arguments to pass to the tool"
        }
      },
      required: ["server_name", "tool_name", "arguments"]
    }
  },
  access_mcp_resource: {
    name: "access_mcp_resource",
    description: "Access an MCP resource",
    input_schema: {
      type: "object",
      properties: {
        server_name: {
          type: "string",
          description: "The name of the MCP server"
        },
        uri: {
          type: "string",
          description: "The URI of the resource to access"
        }
      },
      required: ["server_name", "uri"]
    }
  },
  ask_followup_question: {
    name: "ask_followup_question",
    description: "Ask a follow-up question",
    input_schema: {
      type: "object",
      properties: {
        question: {
          type: "string",
          description: "The question to ask"
        },
        follow_up: {
          type: "string",
          description: "Additional follow-up content (optional)"
        }
      },
      required: ["question"]
    }
  },
  attempt_completion: {
    name: "attempt_completion",
    description: "Complete a task",
    input_schema: {
      type: "object",
      properties: {
        result: {
          type: "string",
          description: "The result of the task"
        },
        command: {
          type: "string",
          description: "Command information (optional)"
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
          description: "The mode to switch to"
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
    description: "Create a new task",
    input_schema: {
      type: "object",
      properties: {
        mode: {
          type: "string",
          description: "The mode for the new task"
        },
        message: {
          type: "string",
          description: "The message for the new task"
        }
      },
      required: ["mode", "message"]
    }
  },
  codebase_search: {
    name: "codebase_search",
    description: "Search the codebase",
    input_schema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "The search query"
        },
        path: {
          type: "string",
          description: "The path to search in (optional)"
        }
      },
      required: ["query"]
    }
  },
  search_and_replace: {
    name: "search_and_replace",
    description: "Search and replace text in a file",
    input_schema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "The path to the file to modify"
        },
        search: {
          type: "string",
          description: "The text to search for"
        },
        replace: {
          type: "string",
          description: "The text to replace with"
        },
        use_regex: {
          type: "string",
          description: "Whether to use regex for search (optional)"
        },
        ignore_case: {
          type: "string",
          description: "Whether to ignore case in search (optional)"
        },
        start_line: {
          type: "string",
          description: "The line to start searching from (optional)"
        },
        end_line: {
          type: "string",
          description: "The line to end searching at (optional)"
        }
      },
      required: ["path", "search", "replace"]
    }
  }
}

/**
 * Get Anthropic tool schemas for a list of tool names
 */
export function getAnthropicToolSchemas(toolNames: ToolName[]): Anthropic.Tool[] {
  return toolNames.map(name => {
    const schema = ANTHROPIC_TOOL_SCHEMAS[name]
    if (!schema) {
      // Fallback for tools that might not have a defined schema yet
      return {
        name,
        description: TOOL_DISPLAY_NAMES[name] || `Use the ${name} tool`,
        input_schema: {
          type: "object",
          properties: {},
          required: []
        }
      }
    }
    return schema
  })
}