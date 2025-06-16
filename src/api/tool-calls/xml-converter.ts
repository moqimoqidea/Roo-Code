import { Anthropic } from "@anthropic-ai/sdk"
import { ToolName } from "@roo-code/types"
import { ToolUse } from "../../shared/tools"
import { TelemetryService } from "@roo-code/telemetry"

/**
 * Converts a ToolUse object to XML format
 */
export function toolUseToXml(toolUse: ToolUse): string {
  const toolName = toolUse.name
  const params = toolUse.params || {}
  
  // Generate XML parameters
  const paramsXml = Object.entries(params)
    .map(([key, value]) => `<${key}>${value}</${key}>`)
    .join("\n")
  
  // Return full XML
  return `<${toolName}>\n${paramsXml}\n</${toolName}>`
}

/**
 * Converts an Anthropic tool use block to XML format
 */
export function anthropicToolUseToXml(toolUse: Anthropic.ToolUseBlock): string {
  const toolName = toolUse.name
  const params = toolUse.input as Record<string, string>
  
  // Generate XML parameters
  const paramsXml = Object.entries(params)
    .map(([key, value]) => `<${key}>${value}</${key}>`)
    .join("\n")
  
  // Return full XML
  return `<${toolName}>\n${paramsXml}\n</${toolName}>`
}

/**
 * Converts an Anthropic tool use block to a ToolUse object
 */
export function anthropicToolUseToToolUse(toolUse: Anthropic.ToolUseBlock): ToolUse {
  return {
    type: "tool_use",
    name: toolUse.name as ToolName,
    params: toolUse.input as Record<string, string>,
    partial: false
  }
}

/**
 * Converts a tool result to Anthropic tool result format
 */
export function toolResultToAnthropic(
  toolUseId: string,
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