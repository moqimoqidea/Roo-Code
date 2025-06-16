import { Anthropic } from "@anthropic-ai/sdk"
import { Stream as AnthropicStream } from "@anthropic-ai/sdk/streaming"
import { CacheControlEphemeral } from "@anthropic-ai/sdk/resources"

import {
  type ModelInfo,
  type AnthropicModelId,
  anthropicDefaultModelId,
  anthropicModels,
  ANTHROPIC_DEFAULT_MAX_TOKENS,
  type ToolName,
} from "@roo-code/types"

import type { ApiHandlerOptions } from "../../shared/api"

import { ApiStream } from "../transform/stream"
import { getModelParams } from "../transform/model-params"
import { AnthropicToolCallAdapter, createToolCallAdapter } from "../tool-calls"
import { TOOL_DISPLAY_NAMES } from "../../shared/tools"
import { anthropicToolUseToXml } from "../tool-calls/xml-converter"
import { getAnthropicToolSchemas } from "../tool-calls/anthropic-tool-schemas"
import { ToolCallMetrics, trackNativeToolCall } from "../tool-calls/metrics"

import { BaseProvider } from "./base-provider"
import type { SingleCompletionHandler, ApiHandlerCreateMessageMetadata } from "../index"

export class AnthropicEnhancedHandler extends BaseProvider implements SingleCompletionHandler {
  private options: ApiHandlerOptions
  private client: Anthropic
  private toolCallAdapter: AnthropicToolCallAdapter | null = null
  private useNativeToolCalls: boolean = false
  private metrics: ToolCallMetrics = ToolCallMetrics.getInstance()

  constructor(options: ApiHandlerOptions) {
    super()
    this.options = options

    const apiKeyFieldName =
      this.options.anthropicBaseUrl && this.options.anthropicUseAuthToken ? "authToken" : "apiKey"

    this.client = new Anthropic({
      baseURL: this.options.anthropicBaseUrl || undefined,
      [apiKeyFieldName]: this.options.apiKey,
    })

    // Initialize the tool call adapter
    const { id: modelId } = this.getModel()
    this.toolCallAdapter = createToolCallAdapter("anthropic", { modelId }) as AnthropicToolCallAdapter
    
    // Determine if we should use native tool calls
    this.useNativeToolCalls = this.toolCallAdapter?.supportsNativeToolCalls(modelId) ?? false
  }

  async *createMessage(
    systemPrompt: string,
    messages: Anthropic.Messages.MessageParam[],
    metadata?: ApiHandlerCreateMessageMetadata,
  ): ApiStream {
    let stream: AnthropicStream<Anthropic.Messages.RawMessageStreamEvent>
    const cacheControl: CacheControlEphemeral = { type: "ephemeral" }
    let { id: modelId, betas = [], maxTokens, temperature, reasoning: thinking } = this.getModel()

    // Extract available tools from system prompt
    // In a real implementation, we would get this from the Task class or elsewhere
    // This is a simplified approach for demonstration
    const availableTools = this.extractToolsFromSystemPrompt(systemPrompt)
    
    // Track metrics for this request
    const taskId = metadata?.taskId || "unknown-task"
    
    switch (modelId) {
      case "claude-sonnet-4-20250514":
      case "claude-opus-4-20250514":
      case "claude-3-7-sonnet-20250219":
      case "claude-3-5-sonnet-20241022":
      case "claude-3-5-haiku-20241022":
      case "claude-3-opus-20240229":
      case "claude-3-haiku-20240307": {
        /**
         * The latest message will be the new user message, one before
         * will be the assistant message from a previous request, and
         * the user message before that will be a previously cached user
         * message. So we need to mark the latest user message as
         * ephemeral to cache it for the next request, and mark the
         * second to last user message as ephemeral to let the server
         * know the last message to retrieve from the cache for the
         * current request.
         */
        const userMsgIndices = messages.reduce(
          (acc, msg, index) => (msg.role === "user" ? [...acc, index] : acc),
          [] as number[],
        )

        const lastUserMsgIndex = userMsgIndices[userMsgIndices.length - 1] ?? -1
        const secondLastMsgUserIndex = userMsgIndices[userMsgIndices.length - 2] ?? -1

        // Create the request options
        const requestOptions: Anthropic.Messages.MessageCreateParams = {
          model: modelId,
          max_tokens: maxTokens ?? ANTHROPIC_DEFAULT_MAX_TOKENS,
          temperature,
          thinking,
          // Setting cache breakpoint for system prompt so new tasks can reuse it.
          system: [{ text: systemPrompt, type: "text", cache_control: cacheControl }],
          messages: messages.map((message, index) => {
            if (index === lastUserMsgIndex || index === secondLastMsgUserIndex) {
              return {
                ...message,
                content:
                  typeof message.content === "string"
                    ? [{ type: "text", text: message.content, cache_control: cacheControl }]
                    : message.content.map((content, contentIndex) =>
                        contentIndex === message.content.length - 1
                          ? { ...content, cache_control: cacheControl }
                          : content,
                      ),
              }
            }
            return message
          }),
          stream: true,
        }

        // Add tools if we're using native tool calling and have available tools
        if (this.useNativeToolCalls && availableTools.length > 0) {
          requestOptions.tools = getAnthropicToolSchemas(availableTools)
        }

        stream = await this.client.messages.create(
          requestOptions,
          (() => {
            // prompt caching: https://x.com/alexalbert__/status/1823751995901272068
            // https://github.com/anthropics/anthropic-sdk-typescript?tab=readme-ov-file#default-headers
            // https://github.com/anthropics/anthropic-sdk-typescript/commit/c920b77fc67bd839bfeb6716ceab9d7c9bbe7393

            // Then check for models that support prompt caching
            switch (modelId) {
              case "claude-sonnet-4-20250514":
              case "claude-opus-4-20250514":
              case "claude-3-7-sonnet-20250219":
              case "claude-3-5-sonnet-20241022":
              case "claude-3-5-haiku-20241022":
              case "claude-3-opus-20240229":
              case "claude-3-haiku-20240307":
                betas.push("prompt-caching-2024-07-31")
                return { headers: { "anthropic-beta": betas.join(",") } }
              default:
                return undefined
            }
          })(),
        )
        break
      }
      default: {
        // Create the request options
        const requestOptions: Anthropic.Messages.MessageCreateParams = {
          model: modelId,
          max_tokens: maxTokens ?? ANTHROPIC_DEFAULT_MAX_TOKENS,
          temperature,
          system: [{ text: systemPrompt, type: "text" }],
          messages,
          stream: true,
        }

        // Add tools if we're using native tool calling and have available tools
        if (this.useNativeToolCalls && availableTools.length > 0) {
          requestOptions.tools = getAnthropicToolSchemas(availableTools)
        }

        stream = (await this.client.messages.create(requestOptions)) as any
        break
      }
    }

    for await (const chunk of stream) {
      switch (chunk.type) {
        case "message_start": {
          // Tells us cache reads/writes/input/output.
          const usage = chunk.message.usage

          yield {
            type: "usage",
            inputTokens: usage.input_tokens || 0,
            outputTokens: usage.output_tokens || 0,
            cacheWriteTokens: usage.cache_creation_input_tokens || undefined,
            cacheReadTokens: usage.cache_read_input_tokens || undefined,
          }

          break
        }
        case "message_delta":
          // Tells us stop_reason, stop_sequence, and output tokens
          // along the way and at the end of the message.
          yield {
            type: "usage",
            inputTokens: 0,
            outputTokens: chunk.usage.output_tokens || 0,
          }

          break
        case "message_stop":
          // No usage data, just an indicator that the message is done.
          break
        case "content_block_start":
          switch (chunk.content_block.type) {
            case "thinking":
              // We may receive multiple text blocks, in which
              // case just insert a line break between them.
              if (chunk.index > 0) {
                yield { type: "reasoning", text: "\n" }
              }

              yield { type: "reasoning", text: chunk.content_block.thinking }
              break
            case "text":
              // We may receive multiple text blocks, in which
              // case just insert a line break between them.
              if (chunk.index > 0) {
                yield { type: "text", text: "\n" }
              }

              yield { type: "text", text: chunk.content_block.text }
              break
            case "tool_use": {
              // Handle native tool call by converting it to XML format
              // so existing code can parse it properly
              try {
                // Record the native tool call in metrics
                this.metrics.recordNativeToolCall(chunk.content_block.name, true)
                
                // Track telemetry for native tool call
                trackNativeToolCall(
                  taskId,
                  chunk.content_block.name as ToolName,
                  "anthropic",
                  modelId,
                  true
                )
                
                // Convert to XML format for compatibility with existing code
                const xmlToolUse = anthropicToolUseToXml(chunk.content_block)
                yield { type: "text", text: xmlToolUse }
              } catch (error) {
                // Record failure in metrics
                this.metrics.recordNativeToolCall(chunk.content_block.name, false)
                
                // Track telemetry for native tool call failure
                trackNativeToolCall(
                  taskId,
                  chunk.content_block.name as ToolName,
                  "anthropic",
                  modelId,
                  false
                )
                
                // Log error but continue (don't crash the stream)
                console.error("Error processing native tool call:", error)
                
                // Send a simplified XML tool use to avoid breaking the client
                const simplifiedXml = `<${chunk.content_block.name}>\n<error>Error processing native tool call</error>\n</${chunk.content_block.name}>`
                yield { type: "text", text: simplifiedXml }
              }
              break
            }
          }
          break
        case "content_block_delta":
          switch (chunk.delta.type) {
            case "thinking_delta":
              yield { type: "reasoning", text: chunk.delta.thinking }
              break
            case "text_delta":
              yield { type: "text", text: chunk.delta.text }
              break
            // We're not handling tool_use_delta incrementally - for simplicity
            // we'll let the content_block_start handler do it all at once
          }

          break
        case "content_block_stop":
          break
      }
    }
  }

  /**
   * Extract available tools from the system prompt
   * This is a simplified implementation - in a real system this would
   * be passed in from the Task class or other configuration
   */
  private extractToolsFromSystemPrompt(systemPrompt: string): ToolName[] {
    // Simple extraction based on the "AVAILABLE TOOLS" section
    // In a real implementation, this would be passed in or determined elsewhere
    const availableTools: ToolName[] = []
    
    // Check if tools are mentioned in the system prompt
    Object.keys(TOOL_DISPLAY_NAMES).forEach(toolName => {
      if (systemPrompt.includes(toolName)) {
        availableTools.push(toolName as ToolName)
      }
    })
    
    return availableTools
  }

  getModel() {
    const modelId = this.options.apiModelId
    let id = modelId && modelId in anthropicModels ? (modelId as AnthropicModelId) : anthropicDefaultModelId
    const info: ModelInfo = anthropicModels[id]

    const params = getModelParams({
      format: "anthropic",
      modelId: id,
      model: info,
      settings: this.options,
    })

    // The `:thinking` suffix indicates that the model is a "Hybrid"
    // reasoning model and that reasoning is required to be enabled.
    // The actual model ID honored by Anthropic's API does not have this
    // suffix.
    return {
      id: id === "claude-3-7-sonnet-20250219:thinking" ? "claude-3-7-sonnet-20250219" : id,
      info,
      betas: id === "claude-3-7-sonnet-20250219:thinking" ? ["output-128k-2025-02-19"] : undefined,
      ...params,
    }
  }

  async completePrompt(prompt: string) {
    let { id: model, temperature } = this.getModel()

    const message = await this.client.messages.create({
      model,
      max_tokens: ANTHROPIC_DEFAULT_MAX_TOKENS,
      thinking: undefined,
      temperature,
      messages: [{ role: "user", content: prompt }],
      stream: false,
    })

    const content = message.content.find(({ type }) => type === "text")
    return content?.type === "text" ? content.text : ""
  }

  /**
   * Counts tokens for the given content using Anthropic's API
   *
   * @param content The content blocks to count tokens for
   * @returns A promise resolving to the token count
   */
  override async countTokens(content: Array<Anthropic.Messages.ContentBlockParam>): Promise<number> {
    try {
      // Use the current model
      const { id: model } = this.getModel()

      const response = await this.client.messages.countTokens({
        model,
        messages: [{ role: "user", content: content }],
      })

      return response.input_tokens
    } catch (error) {
      // Log error but fallback to tiktoken estimation
      console.warn("Anthropic token counting failed, using fallback", error)

      // Use the base provider's implementation as fallback
      return super.countTokens(content)
    }
  }
}