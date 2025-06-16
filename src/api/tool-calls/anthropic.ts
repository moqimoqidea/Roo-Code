import { Anthropic } from "@anthropic-ai/sdk"
import { ToolName } from "@roo-code/types"
import { ToolUse } from "../../shared/tools"
import { ToolCallAdapter, ToolCallAdapterOptions } from "./types"
import { getAnthropicToolSchemas } from "./anthropic-tool-schemas"

/**
 * List of Claude models that support native tool calling
 */
export const CLAUDE_MODELS_WITH_TOOL_CALLING = [
  "claude-3-opus-20240229",
  "claude-3-sonnet-20240229",
  "claude-3-haiku-20240307",
  "claude-3-5-sonnet-20241022",
  "claude-3-5-haiku-20241022",
  "claude-3-7-sonnet-20250219",
  "claude-opus-4-20250514",
  "claude-sonnet-4-20250514"
]

/**
 * Implementation of ToolCallAdapter for Anthropic/Claude models
 */
export class AnthropicToolCallAdapter implements ToolCallAdapter {
  private modelId: string

  constructor(options: ToolCallAdapterOptions) {
    this.modelId = options.modelId
  }

  /**
   * Check if the model supports native tool calling
   */
  supportsNativeToolCalls(modelId: string): boolean {
    return CLAUDE_MODELS_WITH_TOOL_CALLING.includes(modelId)
  }

  /**
   * Convert our internal tool definitions to Anthropic's tool format
   */
  convertToolDefinitionsToProvider(
    toolNames: ToolName[],
    toolDescriptions: Record<ToolName, string>
  ): Anthropic.Tool[] {
    return getAnthropicToolSchemas(toolNames)
  }

  /**
   * Convert our internal ToolUse to Anthropic's tool_use format
   */
  convertToolUseToProvider(toolUse: ToolUse): Anthropic.ToolUseBlockParam {
    return {
      type: "tool_use",
      name: toolUse.name,
      input: toolUse.params
    }
  }

  /**
   * Convert a tool result to Anthropic's tool_result format
   */
  convertToolResultToProvider(
    toolUseId: string,
    toolName: ToolName,
    result: string | Array<Anthropic.TextBlockParam | Anthropic.ImageBlockParam>
  ): Anthropic.ToolResultBlockParam {
    // If result is a string, convert to a text block
    const content = typeof result === "string" 
      ? [{ type: "text" as const, text: result }] 
      : result
    
    return {
      type: "tool_result",
      tool_use_id: toolUseId,
      content
    }
  }

  /**
   * Convert Anthropic's tool_use to our internal ToolUse format
   */
  convertProviderToolCallToToolUse(providerToolCall: Anthropic.ToolUseBlock): ToolUse {
    return {
      type: "tool_use",
      name: providerToolCall.name as ToolName,
      params: providerToolCall.input as any,
      partial: false
    }
  }

  /**
   * Get any message format updates needed for tool calling
   */
  getMessageFormatUpdates(): any {
    // For Anthropic, we need to add the tools to the request
    return {
      // This will be filled in by the adapter user
      tools: []
    }
  }
}

/**
 * Factory for creating Anthropic tool call adapters
 */
export class AnthropicToolCallAdapterFactory {
  /**
   * Create an Anthropic tool call adapter if the model supports it
   */
  createAdapter(options: ToolCallAdapterOptions): ToolCallAdapter | null {
    const adapter = new AnthropicToolCallAdapter(options)
    
    if (adapter.supportsNativeToolCalls(options.modelId)) {
      return adapter
    }
    
    return null
  }
}