import { describe, test, expect, beforeEach, vi, afterEach } from "vitest"
import { Anthropic } from "@anthropic-ai/sdk"
import { AnthropicToolCallAdapter } from "../anthropic"
import { CLAUDE_MODELS_WITH_TOOL_CALLING } from "../anthropic"
import { anthropicToolUseToXml } from "../xml-converter"
import { getAnthropicToolSchemas } from "../anthropic-tool-schemas"
import { ToolName } from "@roo-code/types"
import { ToolUse } from "../../../shared/tools"

describe("AnthropicToolCallAdapter", () => {
  let adapter: AnthropicToolCallAdapter

  beforeEach(() => {
    adapter = new AnthropicToolCallAdapter({ modelId: "claude-3-opus-20240229" })
  })

  test("supports native tool calls for supported models", () => {
    for (const model of CLAUDE_MODELS_WITH_TOOL_CALLING) {
      expect(adapter.supportsNativeToolCalls(model)).toBe(true)
    }
  })

  test("does not support native tool calls for unsupported models", () => {
    expect(adapter.supportsNativeToolCalls("claude-2")).toBe(false)
    expect(adapter.supportsNativeToolCalls("claude-instant-1")).toBe(false)
    expect(adapter.supportsNativeToolCalls("gpt-4")).toBe(false)
  })

  test("converts tool definitions to Anthropic format", () => {
    const toolNames: ToolName[] = ["read_file", "execute_command"]
    const toolDescriptions: Record<ToolName, string> = {
      read_file: "Read file contents",
      execute_command: "Execute a shell command"
    }

    const result = adapter.convertToolDefinitionsToProvider(toolNames, toolDescriptions)
    
    expect(result).toHaveLength(2)
    expect(result[0].name).toBe("read_file")
    expect(result[1].name).toBe("execute_command")
    expect(result[0].input_schema).toHaveProperty("type", "object")
    expect(result[1].input_schema).toHaveProperty("type", "object")
  })

  test("converts tool use to Anthropic format", () => {
    const toolUse: ToolUse = {
      type: "tool_use",
      name: "read_file",
      params: {
        path: "/path/to/file.txt"
      },
      partial: false
    }

    const result = adapter.convertToolUseToProvider(toolUse)
    
    expect(result).toHaveProperty("type", "tool_use")
    expect(result).toHaveProperty("name", "read_file")
    expect(result).toHaveProperty("input")
    expect(result.input).toHaveProperty("path", "/path/to/file.txt")
  })

  test("converts tool result to Anthropic format", () => {
    const toolUseId = "tool_123"
    const toolName: ToolName = "read_file"
    const result = "File content here"

    const converted = adapter.convertToolResultToProvider(toolUseId, toolName, result)
    
    expect(converted).toHaveProperty("type", "tool_result")
    expect(converted).toHaveProperty("tool_use_id", toolUseId)
    expect(converted).toHaveProperty("content")
    expect(converted.content).toHaveLength(1)
    expect(converted.content[0]).toHaveProperty("type", "text")
    expect(converted.content[0]).toHaveProperty("text", result)
  })

  test("converts Anthropic tool call to tool use", () => {
    const anthropicToolCall: Anthropic.ToolUseBlock = {
      type: "tool_use",
      id: "tool_123",
      name: "read_file",
      input: {
        path: "/path/to/file.txt"
      }
    }

    const result = adapter.convertProviderToolCallToToolUse(anthropicToolCall)
    
    expect(result).toHaveProperty("type", "tool_use")
    expect(result).toHaveProperty("name", "read_file")
    expect(result).toHaveProperty("params")
    expect(result.params).toHaveProperty("path", "/path/to/file.txt")
    expect(result).toHaveProperty("partial", false)
  })
})

describe("anthropicToolUseToXml", () => {
  test("converts Anthropic tool use to XML format", () => {
    const anthropicToolCall: Anthropic.ToolUseBlock = {
      type: "tool_use",
      id: "tool_123",
      name: "read_file",
      input: {
        path: "/path/to/file.txt"
      }
    }

    const xmlResult = anthropicToolUseToXml(anthropicToolCall)
    
    expect(xmlResult).toContain("<read_file>")
    expect(xmlResult).toContain("<path>/path/to/file.txt</path>")
    expect(xmlResult).toContain("</read_file>")
  })

  test("handles multiple parameters", () => {
    const anthropicToolCall: Anthropic.ToolUseBlock = {
      type: "tool_use",
      id: "tool_123",
      name: "execute_command",
      input: {
        command: "ls -la",
        cwd: "/home/user"
      }
    }

    const xmlResult = anthropicToolUseToXml(anthropicToolCall)
    
    expect(xmlResult).toContain("<execute_command>")
    expect(xmlResult).toContain("<command>ls -la</command>")
    expect(xmlResult).toContain("<cwd>/home/user</cwd>")
    expect(xmlResult).toContain("</execute_command>")
  })
})

describe("getAnthropicToolSchemas", () => {
  test("returns schemas for specified tools", () => {
    const toolNames: ToolName[] = ["read_file", "execute_command"]
    
    const schemas = getAnthropicToolSchemas(toolNames)
    
    expect(schemas).toHaveLength(2)
    expect(schemas[0].name).toBe("read_file")
    expect(schemas[1].name).toBe("execute_command")
    expect(schemas[0].input_schema).toBeDefined()
    expect(schemas[1].input_schema).toBeDefined()
  })

  test("handles tools without defined schemas", () => {
    const toolNames: ToolName[] = ["read_file", "unknown_tool" as ToolName]
    
    const schemas = getAnthropicToolSchemas(toolNames)
    
    expect(schemas).toHaveLength(2)
    expect(schemas[0].name).toBe("read_file")
    expect(schemas[1].name).toBe("unknown_tool")
    expect(schemas[0].input_schema).toBeDefined()
    expect(schemas[1].input_schema).toBeDefined()
    // Default schema for unknown tools should have empty properties
    expect(schemas[1].input_schema.properties).toEqual({})
  })
})