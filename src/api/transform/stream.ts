export type ApiStream = AsyncGenerator<ApiStreamChunk>

export type ApiStreamChunk = ApiStreamTextChunk | ApiStreamUsageChunk | ApiStreamReasoningChunk | ApiStreamError | AnthropicApiStreamToolUseChunk | AnthropicApiStreamToolUseDeltaChunk

export interface ApiStreamError {
	type: "error"
	error: string
	message: string
}

export interface ApiStreamTextChunk {
	type: "text"
	text: string
}

export interface ApiStreamReasoningChunk {
	type: "reasoning"
	text: string
}

export interface ApiStreamUsageChunk {
	type: "usage"
	inputTokens: number
	outputTokens: number
	cacheWriteTokens?: number
	cacheReadTokens?: number
	reasoningTokens?: number
	totalCost?: number
}

export interface AnthropicApiStreamToolUseChunk {
	type: "anthropic_tool_use"
	id: string
	name: string
	input: any
}

export interface AnthropicApiStreamToolUseDeltaChunk {
	type: "anthropic_tool_use_delta"
	partial_json: string
}
