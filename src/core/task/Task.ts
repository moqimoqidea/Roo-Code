import * as path from "path"
import os from "os"
import crypto from "crypto"
import EventEmitter from "events"

import { Anthropic } from "@anthropic-ai/sdk"
import delay from "delay"
import pWaitFor from "p-wait-for"
import { serializeError } from "serialize-error"

import {
	type ProviderSettings,
	type TokenUsage,
	type ToolUsage,
	type ToolName,
	type ContextCondense,
	type ClineAsk,
	type ClineMessage,
	type ClineSay,
	type ToolProgressStatus,
	type HistoryItem,
	TelemetryEventName,
} from "@roo-code/types"
import { TelemetryService } from "@roo-code/telemetry"
import { CloudService } from "@roo-code/cloud"

// api
import { ApiHandler, ApiHandlerCreateMessageMetadata, buildApiHandler } from "../../api"
import { ApiStream } from "../../api/transform/stream"

// shared
import { findLastIndex } from "../../shared/array"
import { combineApiRequests } from "../../shared/combineApiRequests"
import { combineCommandSequences } from "../../shared/combineCommandSequences"
import { t } from "../../i18n"
import { ClineApiReqCancelReason, ClineApiReqInfo } from "../../shared/ExtensionMessage"
import { getApiMetrics } from "../../shared/getApiMetrics"
import { ClineAskResponse } from "../../shared/WebviewMessage"
import { defaultModeSlug } from "../../shared/modes"
import { DiffStrategy } from "../../shared/tools"
import { EXPERIMENT_IDS, experiments } from "../../shared/experiments"

// services
import { UrlContentFetcher } from "../../services/browser/UrlContentFetcher"
import { BrowserSession } from "../../services/browser/BrowserSession"
import { McpHub } from "../../services/mcp/McpHub"
import { McpServerManager } from "../../services/mcp/McpServerManager"
import { RepoPerTaskCheckpointService } from "../../services/checkpoints"

// integrations
import { DiffViewProvider } from "../../integrations/editor/DiffViewProvider"
import { findToolName, formatContentBlockToMarkdown } from "../../integrations/misc/export-markdown"
import { RooTerminalProcess } from "../../integrations/terminal/types"
import { TerminalRegistry } from "../../integrations/terminal/TerminalRegistry"

// utils
import { calculateApiCostAnthropic } from "../../shared/cost"
import { getWorkspacePath } from "../../utils/path"

// prompts
import { formatResponse } from "../prompts/responses"
import { SYSTEM_PROMPT } from "../prompts/system"

// core modules
import { ToolRepetitionDetector } from "../tools/ToolRepetitionDetector"
import { FileContextTracker } from "../context-tracking/FileContextTracker"
import { RooIgnoreController } from "../ignore/RooIgnoreController"
import { RooProtectedController } from "../protect/RooProtectedController"
import { type AssistantMessageContent, parseAssistantMessage, presentAssistantMessage } from "../assistant-message"
import { truncateConversationIfNeeded } from "../sliding-window"
import { ClineProvider } from "../webview/ClineProvider"
import { MultiSearchReplaceDiffStrategy } from "../diff/strategies/multi-search-replace"
import { MultiFileSearchReplaceDiffStrategy } from "../diff/strategies/multi-file-search-replace"
import { readApiMessages, saveApiMessages, readTaskMessages, saveTaskMessages, taskMetadata } from "../task-persistence"
import { getEnvironmentDetails } from "../environment/getEnvironmentDetails"
import {
	type CheckpointDiffOptions,
	type CheckpointRestoreOptions,
	getCheckpointService,
	checkpointSave,
	checkpointRestore,
	checkpointDiff,
} from "../checkpoints"
import { processUserContentMentions } from "../mentions/processUserContentMentions"
import { ApiMessage } from "../task-persistence/apiMessages"
import { getMessagesSinceLastSummary, summarizeConversation } from "../condense"
import { maybeRemoveImageBlocks } from "../../api/transform/image-cleaning"

export type ClineEvents = {
	message: [{ action: "created" | "updated"; message: ClineMessage }]
	taskStarted: []
	taskModeSwitched: [taskId: string, mode: string]
	taskPaused: []
	taskUnpaused: []
	taskAskResponded: []
	taskAborted: []
	taskSpawned: [taskId: string]
	taskCompleted: [taskId: string, tokenUsage: TokenUsage, toolUsage: ToolUsage]
	taskTokenUsageUpdated: [taskId: string, tokenUsage: TokenUsage]
	taskToolFailed: [taskId: string, tool: ToolName, error: string]
}

export type TaskOptions = {
	provider: ClineProvider
	apiConfiguration: ProviderSettings
	enableDiff?: boolean
	enableCheckpoints?: boolean
	fuzzyMatchThreshold?: number
	consecutiveMistakeLimit?: number
	task?: string
	images?: string[]
	historyItem?: HistoryItem
	experiments?: Record<string, boolean>
	startTask?: boolean
	rootTask?: Task
	parentTask?: Task
	taskNumber?: number
	onCreated?: (cline: Task) => void
}

export class Task extends EventEmitter<ClineEvents> {
	readonly taskId: string
	readonly instanceId: string

	readonly rootTask: Task | undefined = undefined
	readonly parentTask: Task | undefined = undefined
	readonly taskNumber: number
	readonly workspacePath: string

	providerRef: WeakRef<ClineProvider>
	private readonly globalStoragePath: string
	abort: boolean = false
	didFinishAbortingStream = false
	abandoned = false
	isInitialized = false
	isPaused: boolean = false
	pausedModeSlug: string = defaultModeSlug
	private pauseInterval: NodeJS.Timeout | undefined

	// API
	readonly apiConfiguration: ProviderSettings
	api: ApiHandler
	private lastApiRequestTime?: number
	private consecutiveAutoApprovedRequestsCount: number = 0

	toolRepetitionDetector: ToolRepetitionDetector
	rooIgnoreController?: RooIgnoreController
	rooProtectedController?: RooProtectedController
	fileContextTracker: FileContextTracker
	urlContentFetcher: UrlContentFetcher
	terminalProcess?: RooTerminalProcess

	// Computer User
	browserSession: BrowserSession

	// Editing
	diffViewProvider: DiffViewProvider
	diffStrategy?: DiffStrategy
	diffEnabled: boolean = false
	fuzzyMatchThreshold: number
	didEditFile: boolean = false

	// LLM Messages & Chat Messages
	apiConversationHistory: ApiMessage[] = []
	clineMessages: ClineMessage[] = []

	// Ask
	private askResponse?: ClineAskResponse
	private askResponseText?: string
	private askResponseImages?: string[]
	public lastMessageTs?: number

	// Tool Use
	consecutiveMistakeCount: number = 0
	consecutiveMistakeLimit: number
	consecutiveMistakeCountForApplyDiff: Map<string, number> = new Map()
	toolUsage: ToolUsage = {}

	// Checkpoints
	enableCheckpoints: boolean
	checkpointService?: RepoPerTaskCheckpointService
	checkpointServiceInitializing = false

	// Streaming
	isWaitingForFirstChunk = false
	isStreaming = false
	currentStreamingContentIndex = 0
	assistantMessageContent: AssistantMessageContent[] = []
	presentAssistantMessageLocked = false
	presentAssistantMessageHasPendingUpdates = false
	userMessageContent: (Anthropic.TextBlockParam | Anthropic.ImageBlockParam)[] = []
	userMessageContentReady = false
	didRejectTool = false
	didAlreadyUseTool = false
	didCompleteReadingStream = false

	constructor({
		provider,
		apiConfiguration,
		enableDiff = false,
		enableCheckpoints = false,
		fuzzyMatchThreshold = 0.85,
		consecutiveMistakeLimit = 10,
		task,
		images,
		historyItem,
		experiments: experimentOverrides,
		startTask = true,
		rootTask,
		parentTask,
		taskNumber,
		onCreated,
	}: TaskOptions) {
		super()
		this.instanceId = crypto.randomBytes(16).toString("hex")
		this.taskId = task ? crypto.createHash("sha256").update(task).digest("hex").slice(0, 16) : this.instanceId
		this.terminalProcess = TerminalRegistry.getTerminalProcess(this.taskId)

		this.providerRef = new WeakRef(provider)
		this.globalStoragePath = provider.globalStoragePath
		this.apiConfiguration = apiConfiguration
		this.api = buildApiHandler(apiConfiguration)
		this.checkpointService = undefined
		this.toolRepetitionDetector = new ToolRepetitionDetector()
		this.rootTask = rootTask ?? this.rootTask
		this.parentTask = parentTask ?? this.parentTask
		this.taskNumber = taskNumber ?? 1
		this.workspacePath = getWorkspacePath()

		this.rooIgnoreController = provider.rooIgnoreController
		this.rooProtectedController = provider.rooProtectedController
		this.fileContextTracker = provider.fileContextTracker
		this.urlContentFetcher = provider.urlContentFetcher

		this.browserSession = new BrowserSession(this.urlContentFetcher)

		this.diffViewProvider = provider.diffViewProvider
		this.diffEnabled = enableDiff
		this.enableCheckpoints = enableCheckpoints
		this.fuzzyMatchThreshold = fuzzyMatchThreshold
		this.consecutiveMistakeLimit = consecutiveMistakeLimit

		experiments.instance.resetOverrides()
		if (experimentOverrides) {
			experiments.instance.overrideAll(experimentOverrides)
		}

		this.log("Constructed Cline with taskId:", this.taskId, "instanceId:", this.instanceId)

		if (historyItem && historyItem.conversationId) {
			this.log("historyItem provided:", historyItem.conversationId)
		}

		if (task && startTask) {
			this.isInitialized = true

			this.taskApiRequest({
				mode: this.providerRef.deref()!.mode,
				message: task,
				images,
				historyItem,
			})
		}

		onCreated?.(this)
	}

	public recordToolUsage(toolName: ToolName) {
		// Record tool usage stats
		if (!this.toolUsage[toolName]) {
			this.toolUsage[toolName] = { attempts: 0, failures: 0 }
		}
		this.toolUsage[toolName].attempts++
	}

	public recordNativeToolUsage(toolName: string, provider: string, modelId: string) {
		// Record in tool usage stats
		if (!this.toolUsage[toolName as ToolName]) {
			this.toolUsage[toolName as ToolName] = { attempts: 0, failures: 0 }
		}
		this.toolUsage[toolName as ToolName].attempts++
		
		// Track native tool usage in telemetry
		TelemetryService.instance.captureNativeToolUsage(this.taskId, toolName, provider, modelId)
	}

	public recordToolError(toolName: ToolName, error?: string) {
		if (!this.toolUsage[toolName]) {
			this.toolUsage[toolName] = { attempts: 0, failures: 0 }
		}
		this.toolUsage[toolName].failures++
		this.emit("taskToolFailed", this.taskId, toolName, error ?? "Unknown error")
	}

	public reportTokens(input: number, output: number) {
		const tokenUsage = {
			input,
			output,
			total: input + output,
		}

		this.emit("taskTokenUsageUpdated", this.taskId, tokenUsage)
	}

	public log(...args: any[]) {
		// Suppressing logging for now
		// Typically we'd use a flag like this.loggingEnabled
		// But for now, let's just suppress everything
	}

	public async taskApiRequest(
		{
			mode,
			message,
			images,
			historyItem,
			conversationSummary,
			newTask = false,
			contextCondense,
			originalPrompt,
		}: {
			mode: string
			message: string
			images?: string[]
			historyItem?: HistoryItem
			conversationSummary?: string
			newTask?: boolean
			contextCondense?: ContextCondense
			originalPrompt?: string
		},
		options?: {
			/**
			 * If true, will clear all conversation history.
			 */
			resetTask?: boolean
			/**
			 * We want to save the conversation history, but not actually send the message to the API.
			 */
			dryRun?: boolean
		},
	): Promise<{
		success: boolean
		tokenCount?: {
			input: number
			output: number
		}
	}> {
		// CONDITION: Reject repeated taskApiRequest calls while a task is running.
		if (this.isStreaming && !options?.dryRun) {
			this.log("taskApiRequest: Rejecting taskApiRequest while streaming (isStreaming=true)")
			return { success: false }
		}

		// Reset before starting
		if (options?.resetTask) {
			this.clineMessages = []
			this.apiConversationHistory = []
		}

		if (historyItem && historyItem.conversationId) {
			this.log("taskApiRequest: historyItem provided, conversationId:", historyItem.conversationId)
			const apiMessages = await readApiMessages(historyItem.conversationId, this.globalStoragePath)
			const taskMessages = await readTaskMessages(historyItem.conversationId, this.globalStoragePath)

			if (apiMessages) {
				this.apiConversationHistory = apiMessages
				this.log("taskApiRequest: loaded", apiMessages.length, "API messages")
			}

			if (taskMessages) {
				this.clineMessages = taskMessages
				this.log("taskApiRequest: loaded", taskMessages.length, "task messages")
			}
		}

		// Set up checkpoint if available
		if (this.enableCheckpoints && !this.checkpointService) {
			this.checkpointServiceInitializing = true
			try {
				this.checkpointService = await getCheckpointService(this.taskId)
			} catch (e) {
				this.log("Checkpoint service initialization failed", e)
			}
			this.checkpointServiceInitializing = false
		}

		// Don't add a task message here with no real message
		if (message && !options?.dryRun) {
			try {
				// Add user message to clineMessages
				const userMessage: ClineMessage = {
					id: crypto.randomBytes(16).toString("hex"),
					role: "user",
					content: message,
					taskId: this.taskId,
					timestamp: new Date().toISOString(),
					instance: this.instanceId,
					images,
					mentions: processUserContentMentions(message),
				}
				this.clineMessages.push(userMessage)
				this.emit("message", { action: "created", message: userMessage })

				// Only track images when they're passed in directly.
				// Images that come from links/history will be omitted.
				// This is not stored in a state machine for now, just for metrics.
				const imagesLength = images ? images.length : 0
				TelemetryService.instance.captureTaskConversationMessage(this.taskId, message.length, true)

				if (contextCondense) {
					const { mode, condenseCount } = contextCondense
					try {
						// We need to save the messages BEFORE we do any condensing
						const conversationId = await taskMetadata(this.taskId, this.globalStoragePath)
							.get()
							.then((meta) => meta?.conversationId)

						if (conversationId && condenseCount > 0) {
							await saveApiMessages(
								conversationId,
								this.apiConversationHistory,
								this.globalStoragePath,
							)
							await saveTaskMessages(conversationId, this.clineMessages, this.globalStoragePath)
						}

						// Get messages since last summary
						const messages = getMessagesSinceLastSummary(this.apiConversationHistory)

						// If the number of messages is greater than the threshold, condense them
						if (messages.length >= condenseCount && condenseCount > 0) {
							const summary = await summarizeConversation(
								this.apiConfiguration,
								messages,
								mode || this.providerRef.deref()!.mode,
							)

							if (summary) {
								// If the summary is different from the previous one, condense
								this.apiConversationHistory = truncateConversationIfNeeded(
									this.apiConversationHistory,
									summary,
								)
							}
						}
					} catch (e) {
						this.log("Error condensing conversation:", e)
					}
				}
			} catch (e) {
				this.log("Failed to add user message to clineMessages", e)
				return { success: false }
			}
		}

		if (options?.dryRun) {
			return { success: true }
		}

		// Start task
		if (!this.isInitialized || newTask) {
			this.isInitialized = true
			this.emit("taskStarted")
		}

		// Even if the message is empty, we still want to capture a
		// conversation start event.
		if (this.clineMessages.length <= 1) {
			TelemetryService.instance.captureTaskStarted(
				this.taskId,
				this.providerRef.deref()!.mode,
				CloudService.instance.codebaseIndexMode,
			)
		}

		const env = getEnvironmentDetails(this.workspacePath, this.providerRef.deref()!.mode)

		// Get the full untruncated system prompt from the provider
		const systemPrompt = await this.providerRef.deref()!.getSystemPrompt(env, originalPrompt)

		const abortReason = await this.recursivelyMakeClineRequests(systemPrompt, conversationSummary)

		if (abortReason) {
			this.log("taskApiRequest: aborted:", abortReason)
			return { success: false }
		}

		return { success: true }
	}

	private async recursivelyMakeClineRequests(
		systemPrompt: string,
		conversationSummary?: string,
		previousAttemptTimestamp?: number,
	): Promise<ClineApiReqCancelReason | undefined> {
		try {
			// Block further requests if we're aborting
			if (this.abort) {
				this.didFinishAbortingStream = true
				this.log("recursivelyMakeClineRequests: aborting because abort=true")
				this.abort = false // Reset for future use.
				return "cancelled"
			}

			this.log("recursivelyMakeClineRequests: preparing to make API request")

			// Prevent processing of further assistantMessageContent
			this.presentAssistantMessageLocked = true

			// Reset for new content
			this.assistantMessageContent = []
			this.currentStreamingContentIndex = 0
			this.userMessageContentReady = false
			this.didAlreadyUseTool = false
			this.didCompleteReadingStream = false
			this.didRejectTool = false

			// Prepare for streaming
			this.isStreaming = true

			this.log("recursivelyMakeClineRequests: attempting api request")
			const result = await this.attemptApiRequest(systemPrompt, conversationSummary)

			// Reset lastApiRequestTime if the user has manually approved something.
			if (this.askResponse && this.askResponse.response === "yesButtonClicked") {
				this.lastApiRequestTime = undefined
				this.consecutiveAutoApprovedRequestsCount = 0
			}

			// if was cancelled, return as cancelled
			if (result === "cancelled" || result === "error") {
				this.log(`recursivelyMakeClineRequests: api request cancelled with reason ${result}`)
				if (this.isStreaming) {
					this.isStreaming = false
				}
				return result
			}

			// If the user explicitly denied (say via a tool), then need to wait
			// for them to provide input.
			if (this.didRejectTool) {
				this.isStreaming = false
				this.log("recursivelyMakeClineRequests: didRejectTool, waiting for user input")
				return
			}

			// If we're not using a tool, no need to make another request,
			// because we don't have anything to continue on.
			if (!this.didAlreadyUseTool) {
				this.isStreaming = false
				this.log("recursivelyMakeClineRequests: not using a tool, returning")
				return
			}

			// For pause, we wait indefinitely until unpaused
			if (this.isPaused) {
				this.emit("taskPaused")
				this.isStreaming = false
				try {
					await pWaitFor(() => !this.isPaused, { interval: 100 })
				} catch (e) {
					// ignore
				}
				this.log("recursivelyMakeClineRequests: task unpaused, resuming")
				this.emit("taskUnpaused")
			}

			// Throttle requests to prevent self-conversations where the model
			// has uncontrollable urges to talk to itself. This tends to happen
			// if the model is allowed to make requests too quickly.
			const timeSinceLastRequest = this.lastApiRequestTime
				? Date.now() - this.lastApiRequestTime
				: undefined
			this.lastApiRequestTime = Date.now()

			if (
				previousAttemptTimestamp &&
				// If we're seeing <=500ms between requests, there's a good
				// chance we're in a "self-conversation" with the model. However,
				// we'll also see these rapid requests if the model is just
				// rapidly using tools with no user interaction, which is also a
				// valid use case.
				Date.now() - previousAttemptTimestamp <= 500 &&
				// Rate-limit auto-approved requests more heavily than user-approved
				// requests, since the user is aware of what the LLM is requesting.
				this.consecutiveAutoApprovedRequestsCount > 0
			) {
				const delayMs = 1000
				this.log(`recursivelyMakeClineRequests: delaying ${delayMs}ms to prevent self-conversation`)
				await delay(delayMs)
			}

			this.log("recursivelyMakeClineRequests: recursing")
			return this.recursivelyMakeClineRequests(systemPrompt, conversationSummary, Date.now())
		} catch (e) {
			this.log("recursivelyMakeClineRequests error:", e)
			this.isStreaming = false
			return "error"
		}
	}

	private async attemptApiRequest(
		systemPrompt: string,
		conversationSummary?: string,
	): Promise<ClineApiReqCancelReason | undefined> {
		try {
			// Let the webview know we're going to make a request
			const reqId = crypto.randomBytes(16).toString("hex")
			const reqInfo: ClineApiReqInfo = {
				reqId,
				taskId: this.taskId,
				label: this.providerRef.deref()!.apiConfiguration.apiProvider,
				status: "pending",
			}

			this.isWaitingForFirstChunk = true
			let tokenCount: { input: number; output: number } | undefined

			this.log("attemptApiRequest: making api request")

			// Transform API messages and system prompt
			let assistantMessage = ""
			const apiMessages = this.apiConversationToMessages()

			this.log("attemptApiRequest: setting up api stream")

			// Update request status
			reqInfo.status = "in_progress"
			await this.providerRef.deref()!.updateApiReqInfo(reqInfo)

			const apiStream = this.api.createMessage(systemPrompt, apiMessages, {
				mode: this.providerRef.deref()!.mode,
				taskId: this.taskId,
			})

			for await (const chunk of apiStream) {
				// Stop generating response if the task is aborted
				if (this.abort) {
					reqInfo.status = "cancelled"
					await this.providerRef.deref()!.updateApiReqInfo(reqInfo)
					return "cancelled"
				}

				switch (chunk.type) {
					case "text": {
						assistantMessage += chunk.text

						// Parse raw assistant message into content blocks.
						const prevLength = this.assistantMessageContent.length
						this.assistantMessageContent = parseAssistantMessage(assistantMessage)

						if (this.assistantMessageContent.length > prevLength) {
							// New content we need to present, reset to
							// false in case previous content set this to true.
							this.userMessageContentReady = false
						}

						// Present content to user.
						presentAssistantMessage(this)
						break
					}

					case "reasoning": {
						// Do nothing with reasoning text currently, since it's
						// an experimental feature that produces hidden output.
						// We might be able to use this for explaining model
						// decisions in the future.
						break
					}

					case "usage": {
						// This is just usage metrics
						if (chunk.inputTokens > 0 && !tokenCount) {
							tokenCount = {
								input: chunk.inputTokens,
								output: 0,
							}
						}

						if (tokenCount) {
							tokenCount.output += chunk.outputTokens
						}

						if (chunk.cacheReadTokens || chunk.cacheWriteTokens) {
							this.log("attemptApiRequest: cache tokens:", {
								read: chunk.cacheReadTokens,
								write: chunk.cacheWriteTokens,
							})
						}

						this.reportTokens(
							tokenCount?.input ?? 0,
							tokenCount?.output ?? 0,
						)

						break
					}
				}

				if (this.isWaitingForFirstChunk) {
					this.isWaitingForFirstChunk = false
				}
			}

			// We always want to update the cost at the end, even if we did it
			// earlier with the stream, just to be safe.
			if (tokenCount) {
				this.reportTokens(tokenCount.input, tokenCount.output)
			}

			if (this.abort) {
				this.log("attemptApiRequest: aborting (abort=true)")
				reqInfo.status = "cancelled"
				await this.providerRef.deref()!.updateApiReqInfo(reqInfo)
				return "cancelled"
			}

			reqInfo.status = "success"
			await this.providerRef.deref()!.updateApiReqInfo(reqInfo)

			// We're done with the stream, so add assistant message to history
			if (assistantMessage) {
				this.log("attemptApiRequest: adding assistant message to history")
				const assistantMessageObj: ClineMessage = {
					id: crypto.randomBytes(16).toString("hex"),
					role: "assistant",
					content: assistantMessage,
					taskId: this.taskId,
					timestamp: new Date().toISOString(),
					instance: this.instanceId,
				}
				this.clineMessages.push(assistantMessageObj)
				this.emit("message", { action: "created", message: assistantMessageObj })
				TelemetryService.instance.captureTaskConversationMessage(this.taskId, assistantMessage.length, false)
			}

			// We've completed reading the stream
			this.didCompleteReadingStream = true

			// Save conversation history to disk
			await this.saveConversationToDisk()

			if (this.didRejectTool) {
				this.log("attemptApiRequest: didRejectTool, returning")
				return
			}

			// We need more user input, which means we're done
			if (!this.didAlreadyUseTool) {
				this.log("attemptApiRequest: no tool used, returning (didAlreadyUseTool=false)")
				return
			}

			// Allow caller to decide what to do next
			return
		} catch (e) {
			this.log("attemptApiRequest: error:", e)
			TelemetryService.instance.captureLlmError(
				this.taskId,
				e instanceof Error ? e.message : String(e),
				this.apiConfiguration.apiProvider,
				this.apiConfiguration.apiModelId || "unknown",
			)
			this.providerRef.deref()!.say(formatResponse.providerError(this.apiConfiguration.apiProvider))
			return "error"
		}
	}

	public async saveConversationToDisk(): Promise<string | undefined> {
		try {
			const meta = await taskMetadata(this.taskId, this.globalStoragePath).get()
			const conversationId = meta?.conversationId

			if (conversationId) {
				await saveApiMessages(conversationId, this.apiConversationHistory, this.globalStoragePath)
				await saveTaskMessages(conversationId, this.clineMessages, this.globalStoragePath)
			}

			return conversationId
		} catch (error) {
			this.log("Failed to save conversation history:", error)
			return undefined
		}
	}

	/**
	 * Force cancellation of all pending requests and tools.
	 */
	public abortTask() {
		this.log("abortTask called")
		this.abort = true
		this.didFinishAbortingStream = true
	}

	/**
	 * Pauses the task, which prevents further requests from being made.
	 */
	public pauseTask(modeSlug?: string) {
		this.log("pauseTask called")
		this.isPaused = true
		if (modeSlug) {
			this.pausedModeSlug = modeSlug
		}

		// Set up a regular interval to check if the task needs to be reset
		// after a certain period of time.
		this.pauseInterval = setInterval(() => {
			const now = Date.now()
			const lastMessageTs = this.lastMessageTs || now
			const hoursSinceLastMessage = (now - lastMessageTs) / (1000 * 60 * 60)

			// If the task has been paused for more than 24 hours, reset it.
			if (hoursSinceLastMessage > 24) {
				this.log("Task has been paused for more than 24 hours, resetting")
				this.unpauseTask()
				this.abortTask()
			}
		}, 1000 * 60 * 60) // Check once an hour
	}

	/**
	 * Unpauses the task, which allows further requests to be made.
	 */
	public unpauseTask() {
		this.log("unpauseTask called")
		this.isPaused = false

		if (this.pauseInterval) {
			clearInterval(this.pauseInterval)
			this.pauseInterval = undefined
		}
	}

	public async completeTask() {
		this.log("completeTask called")

		// Wait until the task is done aborting and streaming, to avoid completing
		// in the middle of an API request.
		if (this.abort && !this.didFinishAbortingStream) {
			await pWaitFor(() => this.abort && !this.didFinishAbortingStream, { interval: 100 })
		}

		this.emit(
			"taskCompleted",
			this.taskId,
			getApiMetrics(this.apiConversationHistory),
			this.toolUsage,
		)

		// Record metrics
		const metrics = getApiMetrics(this.apiConversationHistory)
		const durationMs = this.getDurationMs()
		TelemetryService.instance.captureTaskCompleted(
			this.taskId,
			this.clineMessages.length,
			durationMs,
			this.providerRef.deref()!.mode,
			metrics.input,
			metrics.output,
			this.apiConfiguration.apiProvider,
			this.apiConfiguration.apiModelId || "unknown",
			this.toolUsage,
		)

		// Store the final cost for this task
		const cost = this.calculateCost()
		if (cost) {
			CloudService.instance.recordCost(this.taskId, cost)
		}
	}

	public getDurationMs(): number {
		if (this.clineMessages.length === 0) {
			return 0
		}

		const firstMessage = this.clineMessages[0]
		const lastMessage = this.clineMessages[this.clineMessages.length - 1]

		const firstTs = new Date(firstMessage.timestamp).getTime()
		const lastTs = new Date(lastMessage.timestamp).getTime()

		return lastTs - firstTs
	}

	public calculateCost(): number | undefined {
		const metrics = getApiMetrics(this.apiConversationHistory)
		switch (this.apiConfiguration.apiProvider) {
			case "anthropic": {
				// Special case of Claude API - we use anthropic-specific cost calculator
				// because they have a model-specific pricing structure.
				const model = this.apiConfiguration.apiModelId
				if (model) {
					return calculateApiCostAnthropic({
						model,
						inputTokens: metrics.input,
						outputTokens: metrics.output,
					})
				}

				return undefined
			}
			case "openai": {
				// Special case for OpenAI - implement per-model billing here
				return undefined
			}
			default:
				return undefined
		}
	}

	public async runDiffStrategy(diffContent: string): Promise<string | null> {
		try {
			if (!this.diffEnabled) {
				this.log("runDiffStrategy: diff not enabled")
				return null
			}

			if (!this.diffStrategy) {
				this.log("runDiffStrategy: no diff strategy")
				return null
			}

			this.log("runDiffStrategy: running diff strategy")
			this.diffStrategy

			if (
				experiments.instance.get(EXPERIMENT_IDS.MULTI_FILE_APPLY_DIFF) &&
				this.diffStrategy instanceof MultiSearchReplaceDiffStrategy
			) {
				return await this.providerRef.deref()!.runMultiFileDiff(
					new MultiFileSearchReplaceDiffStrategy(),
					diffContent,
				)
			}

			return await this.providerRef.deref()!.runDiff(this.diffStrategy, diffContent)
		} catch (e) {
			this.log("runDiffStrategy: error:", e)
			return null
		}
	}

	/**
	 * Asks a question and returns the response. Example questions include tool
	 * usage approval, etc.
	 */
	async ask(
		type: ClineAsk,
		message?: string,
		// Partial if this is a partial message preview
		partial: boolean = false,
		// Tool call state
		progressStatus?: ToolProgressStatus,
		// If true, will not record the askResponse.
		forceApproval?: boolean,
	): Promise<{
		response: string
		text?: string
		images?: string[]
	}> {
		this.log("ask:", { type, message, partial })

		if (forceApproval) {
			this.consecutiveAutoApprovedRequestsCount++
			this.askResponse = { response: "yesButtonClicked" }
			this.askResponseText = undefined
			this.askResponseImages = undefined
			this.emit("taskAskResponded")
			return this.askResponse
		}

		// Continue to use previous responses for partial previews
		if (partial && this.askResponse) {
			this.log("ask: using previous response for partial:", this.askResponse)
			return {
				response: this.askResponse.response,
				text: this.askResponseText,
				images: this.askResponseImages,
			}
		}

		// Clear previous response to force a new one for full (non-partial) tool calls
		if (!partial) {
			this.askResponse = undefined
			this.askResponseText = undefined
			this.askResponseImages = undefined
		}

		// Avoid asking for some stuff, such as formatting help messages.
		const doesntNeedApproval = type === "inline_search"

		if (doesntNeedApproval || this.providerRef.deref()!.autoApprove) {
			this.askResponse = { response: "yesButtonClicked" }
			this.consecutiveAutoApprovedRequestsCount++
			this.emit("taskAskResponded")
			return this.askResponse
		}

		await pWaitFor(() => {
			return !!this.askResponse
		})

		this.lastMessageTs = Date.now()

		const response = {
			response: this.askResponse!.response,
			text: this.askResponseText,
			images: this.askResponseImages,
		}

		if (response.response === "noButtonClicked") {
			this.didRejectTool = true
		}

		this.emit("taskAskResponded")

		return response
	}

	/**
	 * Sets the response for an ask question.
	 */
	public answerAsk(response: string, text?: string, images?: string[]) {
		this.log("answerAsk:", { response, text })
		this.askResponse = { response }
		this.askResponseText = text
		this.askResponseImages = images

		// Record time of this message to detect stale tasks for cleanup
		this.lastMessageTs = Date.now()
	}

	/**
	 * Says a message to the user.
	 */
	public async say(
		type: ClineSay,
		content?: string,
		images?: string[],
		// Whether the content is an incomplete partial or a completed
		// in-progress message.
		partial?: boolean,
	): Promise<void> {
		if (this.abandoned) {
			this.log("say: abandoned, not saying anything")
			return
		}

		await this.providerRef.deref()!.say(type, content, images, partial)
	}

	/**
	 * Produces a formatted error message and sends it to the user, also
	 * increases the mistake count.
	 *
	 * @param toolName The name of the tool that failed.
	 * @param paramName The name of the missing parameter.
	 * @returns The formatted error message that was sent to the user.
	 */
	public async sayAndCreateMissingParamError(toolName: string, paramName: string): Promise<string> {
		this.consecutiveMistakeCount++
		const res = formatResponse.missingParam(toolName, paramName)
		await this.say("tool_error", res)
		return res
	}

	/**
	 * Converts the internal conversation history to Anthropic's message format.
	 */
	private apiConversationToMessages(): Anthropic.Messages.MessageParam[] {
		const result: Anthropic.Messages.MessageParam[] = []

		// Go through each message and extract the user/assistant messages for the API
		for (const message of this.apiConversationHistory) {
			result.push(message.message)
		}

		// Then add the user message which is the last message in clineMessages.
		// Note that the assistant response is not yet in clineMessages.
		const lastUserMessage = findLastIndex(this.clineMessages, (m) => m.role === "user")
		if (lastUserMessage !== -1) {
			const message = this.clineMessages[lastUserMessage]
			const sanitizedContent = message.content || ""

			const userMessage: Anthropic.Messages.MessageParam = {
				role: "user",
				content: message.images
					? [
							...message.images.map((image) => ({
								type: "image" as const,
								source: {
									type: "base64" as const,
									media_type: image.startsWith("data:image/png") ? "image/png" : "image/jpeg",
									data: image.split(",")[1],
								},
							})),
							{ type: "text" as const, text: sanitizedContent },
					  ]
					: sanitizedContent,
			}

			// Clean up any image blocks if necessary
			if (typeof userMessage.content !== "string") {
				userMessage.content = maybeRemoveImageBlocks(userMessage.content)
			}

			// Add the user message to result
			result.push(userMessage)
		}

		// If we just generated a tool result, add the tool result message.
		// This happens in the single-request-per-interaction case.
		if (this.userMessageContentReady && this.userMessageContent.length > 0) {
			result.push({
				role: "user",
				content: this.userMessageContent,
			})
		}

		// Reset the user message content flag and content for next time
		this.userMessageContentReady = false
		this.userMessageContent = []

		// Store the complete API conversation history for the next request
		this.apiConversationHistory = result.map((message, i) => ({
			id: i,
			message,
		}))

		return result
	}
}