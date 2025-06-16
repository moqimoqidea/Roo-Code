import { describe, test, expect } from "vitest"
import { Anthropic } from "@anthropic-ai/sdk"
import { toolUseToXml, anthropicToolUseToXml, anthropicToolUseToToolUse, toolResultToAnthropic } from "../xml-converter"
import { ToolUse } from "../../../shared/tools"

describe("XML converter functions", () => {
  test("toolUseToXml converts tool use to XML", () => {
    const toolUse: ToolUse = {
      type: "tool_use",
      name: "read_file",
      params: {
        path: "/path/to/file.txt"
      },
      partial: false
    }

    const result = toolUseToXml(toolUse)
    
    expect(result).toBe("<read_file>\n<path>/path/to/file.txt</path>\n</read_file>")
  })

  test("toolUseToXml handles multiple parameters", () => {
    const toolUse: ToolUse = {
      type: "tool_use",
      name: "execute_command",
      params: {
        command: "ls -la",
        cwd: "/home/user"
      },
      partial: false
    }

    const result = toolUseToXml(toolUse)
    
    expect(result).toContain("<execute_command>")
    expect(result).toContain("<command>ls -la</command>")
    expect(result).toContain("<cwd>/home/user</cwd>")
    expect(result).toContain("</execute_command>")
  })

  test("anthropicToolUseToXml converts Anthropic tool use to XML", () => {
    const anthropicToolUse: Anthropic.ToolUseBlock = {
      type: "tool_use",
      id: "tool_123",
      name: "read_file",
      input: {
        path: "/path/to/file.txt"
      }
    }

    const result = anthropicToolUseToXml(anthropicToolUse)
    
    expect(result).toBe("<read_file>\n<path>/path/to/file.txt</path>\n</read_file>")
  })

  test("anthropicToolUseToToolUse converts Anthropic tool use to ToolUse", () => {
    const anthropicToolUse: Anthropic.ToolUseBlock = {
      type: "tool_use",
      id: "tool_123",
      name: "read_file",
      input: {
        path: "/path/to/file.txt"
      }
    }

    const result = anthropicToolUseToToolUse(anthropicToolUse)
    
    expect(result).toEqual({
      type: "tool_use",
      name: "read_file",
      params: {
        path: "/path/to/file.txt"
      },
      partial: false
    })
  })

  test("toolResultToAnthropic converts string result to Anthropic format", () => {
    const toolUseId = "tool_123"
    const result = "File content here"

    const converted = toolResultToAnthropic(toolUseId, result)
    
    expect(converted).toEqual({
      type: "tool_result",
      tool_use_id: toolUseId,
      content: [
        {
          type: "text",
          text: result
        }
      ]
    })
  })

  test("toolResultToAnthropic handles array content", () => {
    const toolUseId = "tool_123"
    const result = [
      { type: "text" as const, text: "File content here" },
      { type: "text" as const, text: "More content" }
    ]

    const converted = toolResultToAnthropic(toolUseId, result)
    
    expect(converted).toEqual({
      type: "tool_result",
      tool_use_id: toolUseId,
      content: result
    })
  })
})