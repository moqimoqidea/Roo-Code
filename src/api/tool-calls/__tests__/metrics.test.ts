import { describe, test, expect, beforeEach, vi, afterEach } from "vitest"
import { ToolCallMetrics, trackNativeToolCall, trackXmlToolCall } from "../metrics"
import { TelemetryService } from "@roo-code/telemetry"

// Mock TelemetryService
vi.mock("@roo-code/telemetry", () => ({
  TelemetryService: {
    instance: {
      captureEvent: vi.fn()
    }
  }
}))

describe("Tool Call Metrics", () => {
  let metrics: ToolCallMetrics

  beforeEach(() => {
    metrics = ToolCallMetrics.getInstance()
    metrics.reset()
    vi.clearAllMocks()
  })

  test("records native tool calls", () => {
    metrics.recordNativeToolCall("read_file", true)
    metrics.recordNativeToolCall("execute_command", true)
    metrics.recordNativeToolCall("read_file", false)
    
    const result = metrics.getMetrics()
    
    expect(result.nativeToolCalls).toBe(3)
    expect(result.nativeToolCallSuccesses).toBe(2)
    expect(result.nativeSuccessRate).toBe(2/3)
  })

  test("records XML tool calls", () => {
    metrics.recordXmlToolCall("read_file", true)
    metrics.recordXmlToolCall("execute_command", false)
    metrics.recordXmlToolCall("write_to_file", true)
    
    const result = metrics.getMetrics()
    
    expect(result.xmlToolCalls).toBe(3)
    expect(result.xmlToolCallSuccesses).toBe(2)
    expect(result.xmlSuccessRate).toBe(2/3)
  })

  test("returns success rates by tool", () => {
    // Native tool calls
    metrics.recordNativeToolCall("read_file", true)
    metrics.recordNativeToolCall("read_file", true)
    metrics.recordNativeToolCall("read_file", false)
    metrics.recordNativeToolCall("execute_command", true)
    
    // XML tool calls
    metrics.recordXmlToolCall("read_file", true)
    metrics.recordXmlToolCall("read_file", false)
    metrics.recordXmlToolCall("execute_command", false)
    
    const ratesByTool = metrics.getSuccessRatesByTool()
    
    expect(ratesByTool.native.read_file).toBe(2/3)
    expect(ratesByTool.native.execute_command).toBe(1)
    expect(ratesByTool.xml.read_file).toBe(0.5)
    expect(ratesByTool.xml.execute_command).toBe(0)
  })

  test("reset clears all metrics", () => {
    metrics.recordNativeToolCall("read_file", true)
    metrics.recordXmlToolCall("read_file", true)
    
    metrics.reset()
    
    const result = metrics.getMetrics()
    
    expect(result.nativeToolCalls).toBe(0)
    expect(result.xmlToolCalls).toBe(0)
    expect(result.nativeToolCallSuccesses).toBe(0)
    expect(result.xmlToolCallSuccesses).toBe(0)
  })

  test("handles empty metrics gracefully", () => {
    const result = metrics.getMetrics()
    
    expect(result.nativeSuccessRate).toBe(0)
    expect(result.xmlSuccessRate).toBe(0)
    
    const ratesByTool = metrics.getSuccessRatesByTool()
    
    expect(ratesByTool.native).toEqual({})
    expect(ratesByTool.xml).toEqual({})
  })
})

describe("Telemetry tracking functions", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("trackNativeToolCall sends telemetry event", () => {
    const mockCaptureEvent = vi.mocked(TelemetryService.instance.captureEvent)
    
    trackNativeToolCall("task123", "read_file", "anthropic", "claude-3-opus", true)
    
    expect(mockCaptureEvent).toHaveBeenCalledTimes(1)
    expect(mockCaptureEvent).toHaveBeenCalledWith("native_tool_call", {
      taskId: "task123",
      toolName: "read_file",
      provider: "anthropic",
      modelId: "claude-3-opus",
      success: true
    })
  })

  test("trackXmlToolCall sends telemetry event", () => {
    const mockCaptureEvent = vi.mocked(TelemetryService.instance.captureEvent)
    
    trackXmlToolCall("task123", "execute_command", "anthropic", "claude-3-opus", false)
    
    expect(mockCaptureEvent).toHaveBeenCalledTimes(1)
    expect(mockCaptureEvent).toHaveBeenCalledWith("xml_tool_call", {
      taskId: "task123",
      toolName: "execute_command",
      provider: "anthropic",
      modelId: "claude-3-opus",
      success: false
    })
  })
})