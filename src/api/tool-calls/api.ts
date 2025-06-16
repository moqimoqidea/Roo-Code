import { ToolCallMetrics } from "./metrics"

/**
 * Get metrics about native tool call performance
 */
export function getNativeToolCallMetrics(): any {
  return ToolCallMetrics.getInstance().getMetrics()
}

/**
 * Get detailed metrics about native tool call performance by tool
 */
export function getNativeToolCallMetricsByTool(): any {
  return ToolCallMetrics.getInstance().getSuccessRatesByTool()
}

/**
 * Reset all metrics
 */
export function resetNativeToolCallMetrics(): void {
  ToolCallMetrics.getInstance().reset()
}