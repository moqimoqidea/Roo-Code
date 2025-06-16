import { TelemetryService } from "@roo-code/telemetry"
import { ToolName } from "@roo-code/types"

/**
 * Track native tool call usage in telemetry
 */
export function trackNativeToolCall(
  taskId: string,
  toolName: ToolName,
  provider: string,
  modelId: string,
  success: boolean
): void {
  TelemetryService.instance.captureEvent("native_tool_call", {
    taskId,
    toolName,
    provider,
    modelId,
    success
  })
}

/**
 * Track XML-based tool call usage in telemetry
 */
export function trackXmlToolCall(
  taskId: string,
  toolName: ToolName,
  provider: string,
  modelId: string,
  success: boolean
): void {
  TelemetryService.instance.captureEvent("xml_tool_call", {
    taskId,
    toolName,
    provider,
    modelId,
    success
  })
}

/**
 * Record tool call stats for reliability comparison
 */
export class ToolCallMetrics {
  private static instance: ToolCallMetrics
  
  // Metrics counters
  private nativeToolCalls: number = 0
  private nativeToolCallSuccesses: number = 0
  private xmlToolCalls: number = 0
  private xmlToolCallSuccesses: number = 0
  
  // Track by tool name
  private nativeToolCallsByName: Record<string, { total: number, success: number }> = {}
  private xmlToolCallsByName: Record<string, { total: number, success: number }> = {}
  
  private constructor() {}
  
  /**
   * Get the singleton instance
   */
  public static getInstance(): ToolCallMetrics {
    if (!ToolCallMetrics.instance) {
      ToolCallMetrics.instance = new ToolCallMetrics()
    }
    return ToolCallMetrics.instance
  }
  
  /**
   * Record a native tool call
   */
  public recordNativeToolCall(toolName: string, success: boolean): void {
    this.nativeToolCalls++
    if (success) {
      this.nativeToolCallSuccesses++
    }
    
    // Initialize if first time seeing this tool
    if (!this.nativeToolCallsByName[toolName]) {
      this.nativeToolCallsByName[toolName] = { total: 0, success: 0 }
    }
    
    // Increment counters
    this.nativeToolCallsByName[toolName].total++
    if (success) {
      this.nativeToolCallsByName[toolName].success++
    }
  }
  
  /**
   * Record an XML tool call
   */
  public recordXmlToolCall(toolName: string, success: boolean): void {
    this.xmlToolCalls++
    if (success) {
      this.xmlToolCallSuccesses++
    }
    
    // Initialize if first time seeing this tool
    if (!this.xmlToolCallsByName[toolName]) {
      this.xmlToolCallsByName[toolName] = { total: 0, success: 0 }
    }
    
    // Increment counters
    this.xmlToolCallsByName[toolName].total++
    if (success) {
      this.xmlToolCallsByName[toolName].success++
    }
  }
  
  /**
   * Get overall success rates
   */
  public getSuccessRates(): { native: number, xml: number } {
    const nativeRate = this.nativeToolCalls > 0 
      ? this.nativeToolCallSuccesses / this.nativeToolCalls 
      : 0
      
    const xmlRate = this.xmlToolCalls > 0 
      ? this.xmlToolCallSuccesses / this.xmlToolCalls 
      : 0
      
    return { native: nativeRate, xml: xmlRate }
  }
  
  /**
   * Get success rates by tool name
   */
  public getSuccessRatesByTool(): { 
    native: Record<string, number>, 
    xml: Record<string, number> 
  } {
    const nativeRates: Record<string, number> = {}
    const xmlRates: Record<string, number> = {}
    
    // Calculate native rates
    Object.entries(this.nativeToolCallsByName).forEach(([name, counts]) => {
      nativeRates[name] = counts.total > 0 ? counts.success / counts.total : 0
    })
    
    // Calculate XML rates
    Object.entries(this.xmlToolCallsByName).forEach(([name, counts]) => {
      xmlRates[name] = counts.total > 0 ? counts.success / counts.total : 0
    })
    
    return { native: nativeRates, xml: xmlRates }
  }
  
  /**
   * Get all metrics
   */
  public getMetrics(): {
    nativeToolCalls: number
    nativeToolCallSuccesses: number
    xmlToolCalls: number
    xmlToolCallSuccesses: number
    nativeSuccessRate: number
    xmlSuccessRate: number
  } {
    const { native: nativeSuccessRate, xml: xmlSuccessRate } = this.getSuccessRates()
    
    return {
      nativeToolCalls: this.nativeToolCalls,
      nativeToolCallSuccesses: this.nativeToolCallSuccesses,
      xmlToolCalls: this.xmlToolCalls,
      xmlToolCallSuccesses: this.xmlToolCallSuccesses,
      nativeSuccessRate,
      xmlSuccessRate
    }
  }
  
  /**
   * Reset all metrics
   */
  public reset(): void {
    this.nativeToolCalls = 0
    this.nativeToolCallSuccesses = 0
    this.xmlToolCalls = 0
    this.xmlToolCallSuccesses = 0
    this.nativeToolCallsByName = {}
    this.xmlToolCallsByName = {}
  }
}