import { Anthropic } from "@anthropic-ai/sdk"
import { ToolName } from "@roo-code/types"
import { ToolUse } from "../../shared/tools"

/**
 * Interface for provider-specific tool call adapters.
 * This provides a common interface for converting between our internal tool
 * format and provider-specific formats.
 */
export interface ToolCallAdapter {
  /**
   * Whether the given model supports native tool calling
   */
  supportsNativeToolCalls(modelId: string): boolean
  
  /**
   * Convert tool definitions into provider-specific format for API requests
   */
  convertToolDefinitionsToProvider(
    toolNames: ToolName[],
    toolDescriptions: Record<ToolName, string>
  ): any
  
  /**
   * Convert a tool use (from our XML parsing) to the provider's native format
   */
  convertToolUseToProvider(toolUse: ToolUse): any
  
  /**
   * Convert a tool result to the provider's native format
   */
  convertToolResultToProvider(
    toolUseId: string,
    toolName: ToolName,
    result: string | Array<Anthropic.TextBlockParam | Anthropic.ImageBlockParam>
  ): any
  
  /**
   * Convert provider's native tool call format to our internal ToolUse format
   */
  convertProviderToolCallToToolUse(providerToolCall: any): ToolUse
  
  /**
   * Get message format updates needed for tool calling
   * (some providers might need additional parameters)
   */
  getMessageFormatUpdates(): any
}

/**
 * Options for creating tool call adapters
 */
export interface ToolCallAdapterOptions {
  modelId: string
  // Add any provider-specific options here
}

/**
 * Factory for creating provider-specific tool call adapters
 */
export interface ToolCallAdapterFactory {
  /**
   * Create a tool call adapter for a specific provider and model
   */
  createAdapter(options: ToolCallAdapterOptions): ToolCallAdapter | null
}