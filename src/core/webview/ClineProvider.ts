import { EventEmitter } from "events"
import path from "path"
import fs from "fs"
import os from "os"
import delay from "delay"
import { promisify } from "util"
import { v4 as uuidv4 } from "uuid"
import { z } from "zod"

import {
	type ProviderSettings,
	type TokenUsage,
	type ToolUsage,
	Mode,
	DEFAULT_TOOLS,
	defaultModeSlug,
	TOOLS_FOR_MODE,
	ToolGroup,
} from "@roo-code/types"
import { TelemetryService } from "@roo-code/telemetry"

import { UrlContentFetcher } from "../../services/browser/UrlContentFetcher"
import { DiffViewProvider } from "../../integrations/editor/DiffViewProvider"
import { Task } from "../task/Task"
import { getLoading, getLoadingEnd, getStartPrompt } from "../prompts/task-loading"
import { getEndPrompt } from "../prompts/task-end"
import { SYSTEM_PROMPT, getToolUsePrompt } from "../prompts/system"
import { formatResponse } from "../prompts/responses"
import {
	type ClineMessage,
	type ClineApiReqInfo,
	type ClineSay,
	type ClineAsk,
	type ClineInitialize,
	type ClineEvents,
	ClineUpdateModeUx,
} from "../../shared/ExtensionMessage"
import { DiffStrategy } from "../../shared/tools"
import { MultiFileSearchReplaceDiffStrategy } from "../diff/strategies/multi-file-search-replace"
import { MultiSearchReplaceDiffStrategy } from "../diff/strategies/multi-search-replace"
import { ModeConfig } from "../config/ModeConfig"
import { taskMetadata } from "../task-persistence"
import { getEnvironmentDetails } from "../environment/getEnvironmentDetails"
import { FileContextTracker } from "../context-tracking/FileContextTracker"
import { RooIgnoreController } from "../ignore/RooIgnoreController"
import { RooProtectedController } from "../protect/RooProtectedController"
import { ALWAYS_AVAILABLE_TOOLS, TOOL_GROUPS } from "../../shared/tools"
import { formatSummary, getTopicsSummary } from "../conversation-summary"
import { EXPERIMENT_IDS, experiments } from "../../shared/experiments"
import {
	CHECKPOINTS_REPOSITORY_SPECIFIC,
	type CheckpointDiffOptions,
	type CheckpointRestoreOptions,
	checkpointDiff,
	checkpointRestore,
	checkpointSave,
} from "../checkpoints"
import { getWebviewContextTracking } from "../context-tracking/getWebviewContextTracking"
import { getWebviewDiffTracking } from "../diff/strategies/getWebviewDiffTracking"
import { getWebviewSystemPromptDisplay } from "../prompts/getWebviewSystemPromptDisplay"
import { getCodeSectionCustomPrompt, getModeTitle } from "../prompts/sections/custom-system-prompt"
import { getSharedToolUseSection } from "../prompts/sections/tool-use"
import { getToolPrompt } from "../prompts/tools"

export type ClineProviderOptions = {
	mode: Mode
	apiConfiguration: ProviderSettings
	globalStoragePath: string
	diffViewProvider: DiffViewProvider
	fileContextTracker: FileContextTracker
	urlContentFetcher: UrlContentFetcher
	rooIgnoreController?: RooIgnoreController
	rooProtectedController?: RooProtectedController
	autoApprove?: boolean
	experimentOverrides?: Record<string, boolean>
	onInitialized?: (provider: ClineProvider) => void
	onMessage?: (message: ClineMessage) => void
	onClineEvents?: <K extends keyof ClineEvents>(event: K, listener: (...args: ClineEvents[K]) => void) => void
	onApiReqInfo?: (reqInfo: ClineApiReqInfo) => void
	onAsk?: (type: ClineAsk, message?: string, partial?: boolean) => void
	onSay?: (type: ClineSay, content?: string, images?: string[], partial?: boolean) => void
	onInitialize?: (message: ClineInitialize) => void
	onUpdateModeUx?: (update: ClineUpdateModeUx) => void
}

export class ClineProvider {
	// Keep track of all active instances
	static activeInstances = new Set<ClineProvider>()

	taskId?: string

	// General state
	mode: Mode
	autoApprove?: boolean
	globalStoragePath: string
	fileContextTracker: FileContextTracker
	urlContentFetcher: UrlContentFetcher
	diffViewProvider: DiffViewProvider
	rooIgnoreController?: RooIgnoreController
	rooProtectedController?: RooProtectedController
	private state?: {
		hiddenTools?: Record<string, boolean>
		codeIndexTimeout?: number
		maxReadFileLine?: number
		maxSystemPromptSize?: number
	}

	// Config state
	apiConfiguration: ProviderSettings

	// Conversation state
	activeTask?: Task
	conversations = new Map<string, Task>()
	private tasks: Task[] = []

	// Callbacks
	private emitter: EventEmitter
	private onMessageCallback?: (message: ClineMessage) => void
	private onApiReqInfoCallback?: (reqInfo: ClineApiReqInfo) => void
	private onAskCallback?: (type: ClineAsk, message?: string, partial?: boolean) => void
	private onSayCallback?: (type: ClineSay, content?: string, images?: string[], partial?: boolean) => void
	private onInitializeCallback?: (message: ClineInitialize) => void
	private onUpdateModeUxCallback?: (update: ClineUpdateModeUx) => void

	private modeConfig: ModeConfig
	private customInstructions: string | undefined

	constructor(options: ClineProviderOptions) {
		this.log("ClineProvider instantiated")
		ClineProvider.activeInstances.add(this)
		
		// Make provider available to API handlers for native tool tracking
		(global as any).__CLINE_PROVIDER = this

		this.mode = options.mode
		this.apiConfiguration = options.apiConfiguration
		this.globalStoragePath = options.globalStoragePath
		this.diffViewProvider = options.diffViewProvider
		this.fileContextTracker = options.fileContextTracker
		this.urlContentFetcher = options.urlContentFetcher
		this.rooIgnoreController = options.rooIgnoreController
		this.rooProtectedController = options.rooProtectedController
		this.autoApprove = options.autoApprove
		this.emitter = new EventEmitter()

		if (options.experimentOverrides) {
			experiments.instance.overrideAll(options.experimentOverrides)
		}

		this.onMessageCallback = options.onMessage
		this.onApiReqInfoCallback = options.onApiReqInfo
		this.onAskCallback = options.onAsk
		this.onSayCallback = options.onSay
		this.onInitializeCallback = options.onInitialize
		this.onUpdateModeUxCallback = options.onUpdateModeUx

		if (options.onClineEvents) {
			// Plumb through forwarded event emitter functions
			const events: (keyof ClineEvents)[] = [
				"message",
				"taskStarted",
				"taskModeSwitched",
				"taskPaused",
				"taskUnpaused",
				"taskAskResponded",
				"taskAborted",
				"taskSpawned",
				"taskCompleted",
				"taskTokenUsageUpdated",
				"taskToolFailed",
			]

			for (const event of events) {
				options.onClineEvents(event, (...args: any[]) => {
					this.emitter.emit(event, ...args)
				})
			}
		}

		const modeConfig = new ModeConfig()
		this.modeConfig = modeConfig

		// Load custom instructions for this mode
		this.loadCustomInstructions()

		options.onInitialized?.(this)
	}

	public log(...args: any[]) {
		// Commenting this out since we'll need a proper logging system
	}

	private loadCustomInstructions() {
		this.customInstructions = this.modeConfig.getCustomInstructions(this.mode)
	}

	async updateApiReqInfo(reqInfo: ClineApiReqInfo): Promise<void> {
		if (this.onApiReqInfoCallback) {
			this.onApiReqInfoCallback(reqInfo)
		}
	}

	/**
	 * Gets the system prompt for the current mode.
	 */
	async getSystemPrompt(environment?: Record<string, string>, originalPrompt?: string): Promise<string> {
		const env = environment ?? {}
		const cwd = env.workingDirectory
		const repoInfo = env.gitRepositoryInfo
		const username = env.username
		const computerName = env.computerName
		const workspaceFolders = env.workspaceFolders
		const projectName = env.projectName
		const isDirectory = env.isDirectory
		const platform = env.platform || os.platform()

		const systemPrompt = await SYSTEM_PROMPT({
			mode: this.mode,
			cwd,
			repoInfo,
			username,
			computerName,
			workspaceFolders,
			projectName,
			isDirectory,
			platform,
			originalPrompt,
			customInstructions: this.customInstructions,
		})

		// Allow consumer to truncate if needed
		const { maxSystemPromptSize = 0 } = (await this.getState()) ?? {}

		if (maxSystemPromptSize > 0 && systemPrompt.length > maxSystemPromptSize) {
			// Provide an approximation of chars -> tokens.
			this.log("System prompt exceeded max size:", systemPrompt.length)
			return systemPrompt.slice(0, maxSystemPromptSize)
		}

		return systemPrompt
	}

	/**
	 * Get the task-loading prompt.
	 */
	getLoadingPrompt(taskName: string): string {
		return getLoading({ mode: this.mode, name: taskName })
	}

	getLoadingEndPrompt(taskName: string): string {
		return getLoadingEnd({ mode: this.mode, name: taskName })
	}

	getStartPrompt(taskName: string): string {
		return getStartPrompt({ mode: this.mode, name: taskName })
	}

	/**
	 * Get the task-end prompt.
	 */
	getEndPrompt(): string {
		return getEndPrompt({ mode: this.mode })
	}

	async getSystemPromptUx(customInstructions?: string, originalPrompt?: string): Promise<any> {
		// Environment will be automatically injected
		const environment = getEnvironmentDetails(process.cwd(), this.mode)

		return getWebviewSystemPromptDisplay({
			mode: this.mode,
			cwd: environment.workingDirectory,
			computerName: environment.computerName,
			username: environment.username,
			repoInfo: environment.gitRepositoryInfo,
			projectName: environment.projectName,
			isDirectory: environment.isDirectory,
			workspaceFolders: environment.workspaceFolders,
			platform: environment.platform,
			originalPrompt,
			customInstructions: customInstructions ?? this.customInstructions,
		})
	}

	getDiffSectionUx(): any {
		return getWebviewDiffTracking()
	}

	getContextSectionUx(): any {
		return getWebviewContextTracking()
	}

	getToolsSection(): string {
		return getSharedToolUseSection()
	}

	getToolsSectionUx(): any {
		const defaultTools = this.getDefaultTools()
		return defaultTools.reduce(
			(acc, tool) => {
				// Show defaults if some are used by user
				if (acc.defaults && DEFAULT_TOOLS.includes(tool)) {
					return {
						...acc,
						tools: [...acc.tools, tool],
					}
				}

				// Show tool & clear defaults if not default or we already have non-defaults
				return {
					...acc,
					defaults: false,
					tools: [...acc.tools, tool],
				}
			},
			{ defaults: true, tools: [] as string[] },
		)
	}

	getToolPrompt(toolName: string): string {
		return getToolPrompt(toolName)
	}

	getModeTitle(): string {
		return getModeTitle(this.mode)
	}

	async getState(): Promise<any> {
		if (!this.state) {
			return {}
		}

		return this.state
	}

	async updateState(state: any): Promise<void> {
		this.state = {
			...this.state,
			...state,
		}
	}

	async isToolHidden(toolName: string): Promise<boolean> {
		const { hiddenTools = {} } = (await this.getState()) ?? {}
		return hiddenTools[toolName] ?? false
	}

	async getToolsForMode(mode: Mode): Promise<string[]> {
		const tools = TOOLS_FOR_MODE[mode]?.tools ?? []
		const alwaysAvailableTools = ALWAYS_AVAILABLE_TOOLS ?? []
		const additionalToolGroups = TOOLS_FOR_MODE[mode]?.toolGroups ?? []

		// Add additional tool groups
		const extraTools = additionalToolGroups.flatMap((groupName) => {
			const group = TOOL_GROUPS[groupName as ToolGroup]
			return group?.tools ?? []
		})

		// Deduplicate and sort
		const mergedTools = [...new Set([...tools, ...alwaysAvailableTools, ...extraTools])]
		return mergedTools
	}

	async setHideAllTools(hide: boolean): Promise<void> {
		// Get default tools for this mode
		const defaultTools = await this.getToolsForMode(this.mode)

		// Create new hiddenTools object
		const hiddenTools: Record<string, boolean> = {}
		for (const tool of defaultTools) {
			hiddenTools[tool] = hide
		}

		// Update state
		this.updateState({ hiddenTools })
	}

	async setHideTool(toolName: string, hide: boolean): Promise<void> {
		const { hiddenTools = {} } = (await this.getState()) ?? {}
		this.updateState({
			hiddenTools: {
				...hiddenTools,
				[toolName]: hide,
			},
		})
	}

	async showAllTools(): Promise<void> {
		await this.setHideAllTools(false)
	}

	getDefaultTools(): string[] {
		const tools = TOOLS_FOR_MODE[this.mode]?.tools ?? []
		const alwaysAvailableTools = ALWAYS_AVAILABLE_TOOLS ?? []
		return [...new Set([...tools, ...alwaysAvailableTools])]
	}

	public getTaskById(taskId: string): Task | undefined {
		return this.tasks.find((task) => task.taskId === taskId)
	}

	public createTask(
		task?: string,
		options?: { images?: string[]; historyItem?: any; startTask?: boolean },
	): Task {
		const cline = new Task({
			provider: this,
			apiConfiguration: this.apiConfiguration,
			enableDiff: true,
			enableCheckpoints: experiments.instance.get(EXPERIMENT_IDS.CHECKPOINTS),
			task: task,
			images: options?.images,
			historyItem: options?.historyItem,
			startTask: options?.startTask ?? true,
		})

		// Register the task so it can be retrieved by ID.
		this.tasks.push(cline)
		this.conversations.set(cline.taskId, cline)
		this.activeTask = cline
		this.taskId = cline.taskId

		cline.on("message", ({ action, message }) => {
			this.onMessageCallback?.(message)
		})

		return cline
	}

	/**
	 * Switches to a different mode.
	 *
	 * @param mode The mode to switch to
	 */
	public async switchMode(
		mode: Mode,
		options?: { modeAction?: string; overrideSystemPrompt?: string },
	): Promise<void> {
		const prevMode = this.mode
		this.mode = mode

		// Load custom instructions for this mode
		this.loadCustomInstructions()

		// Notify callers of the mode switch
		this.onUpdateModeUxCallback?.({
			mode,
			showCode: mode === "code",
			modeTitle: this.getModeTitle(),
			modeAction: options?.modeAction,
		})

		// Record mode switch in telemetry
		const task = this.activeTask
		if (task) {
			if (task.isPaused) {
				task.pausedModeSlug = mode
			} else {
				TelemetryService.instance.captureModeSwitched(task.taskId, mode)
				task.emit("taskModeSwitched", task.taskId, mode)
			}
		}
	}

	/**
	 * Execute a task with the LLM.
	 *
	 * @param task The task to execute
	 * @param options Options for the task
	 */
	public async executeTask(
		task: string,
		options?: { historyItem?: any; images?: string[]; contextCondense?: any; originalPrompt?: string },
	): Promise<void> {
		this.log("executeTask", task, options)

		// Create a new task if one doesn't exist
		if (!this.activeTask) {
			const cline = this.createTask(task, {
				historyItem: options?.historyItem,
				images: options?.images,
				startTask: false,
			})

			this.activeTask = cline
			this.taskId = cline.taskId
		}

		if (this.activeTask.isPaused) {
			this.activeTask.unpauseTask()

			// Switch to the mode that was set while paused
			if (this.activeTask.pausedModeSlug !== defaultModeSlug) {
				await this.switchMode(this.activeTask.pausedModeSlug as Mode)
			}
		}

		// Execute the task
		const res = await this.activeTask.taskApiRequest({
			mode: this.mode,
			message: task,
			images: options?.images,
			historyItem: options?.historyItem,
			contextCondense: options?.contextCondense,
			originalPrompt: options?.originalPrompt,
		})

		if (!res.success) {
			this.log("Task failed", res)
		}
	}

	/**
	 * Adds or updates custom instructions.
	 *
	 * @param instructions The custom instructions to add
	 */
	public async updateCustomInstructions(instructions: string): Promise<void> {
		// Store the custom instructions
		await this.modeConfig.setCustomInstructions(this.mode, instructions)

		// Update the instructions
		this.customInstructions = instructions
	}

	/**
	 * Clears the custom instructions.
	 */
	public async clearCustomInstructions(): Promise<void> {
		await this.modeConfig.setCustomInstructions(this.mode, "")
		this.customInstructions = undefined
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
		if (this.onSayCallback) {
			this.onSayCallback(type, content, images, partial)
		}
	}

	/**
	 * Asks the user a question.
	 */
	public async ask(
		type: ClineAsk,
		message?: string,
		partial?: boolean,
	): Promise<void> {
		if (this.onAskCallback) {
			this.onAskCallback(type, message, partial)
		}
	}

	/**
	 * Runs a diff strategy on content.
	 */
	public async runDiff(diffStrategy: DiffStrategy, diffContent: string): Promise<string | null> {
		if (!diffStrategy) {
			this.log("No diff strategy provided")
			return null
		}

		const cwd = process.cwd()
		try {
			this.log("runDiff", diffContent)
			const diffResult = await diffStrategy.applyDiff(diffContent, diffContent)

			this.log("Diff result", diffResult)

			if (!diffResult.success) {
				// Show the diff failure, but continue on in case there are
				// partial successes
				this.say(
					"diff_error",
					formatResponse.diffError(diffStrategy.getName(), diffResult.error || "Unknown error"),
				)
				return null
			}

			this.log("Diff applied successfully")
			return diffResult.content
		} catch (e) {
			this.log("Error applying diff", e)
			this.say("diff_error", formatResponse.diffError(diffStrategy.getName(), String(e)))
			return null
		}
	}

	/**
	 * Runs a multi-file diff strategy on content.
	 */
	public async runMultiFileDiff(
		diffStrategy: MultiFileSearchReplaceDiffStrategy,
		diffContent: string,
	): Promise<string | null> {
		if (!diffStrategy) {
			this.log("No diff strategy provided")
			return null
		}

		try {
			this.log("runMultiFileDiff", diffContent)
			const diffResult = await diffStrategy.applyMultiFileDiff(diffContent)

			this.log("Multi-file diff result", diffResult)

			if (!diffResult.success) {
				// Show the diff failure, but continue on in case there are
				// partial successes
				this.say(
					"diff_error",
					formatResponse.diffError(diffStrategy.getName(), diffResult.error || "Unknown error"),
				)
				return null
			}

			this.log("Multi-file diff applied successfully")
			return diffResult.content
		} catch (e) {
			this.log("Error applying multi-file diff", e)
			this.say("diff_error", formatResponse.diffError(diffStrategy.getName(), String(e)))
			return null
		}
	}

	/**
	 * Creates a checkpoint.
	 */
	public async createCheckpoint(message?: string): Promise<void> {
		if (!this.activeTask || !this.taskId) {
			this.log("No active task")
			return
		}

		try {
			this.log("Creating checkpoint")
			const displayMessage = await checkpointSave(this.taskId, { description: message })
			this.say("checkpoint_created", displayMessage)
		} catch (e) {
			this.log("Error creating checkpoint", e)
			this.say("checkpoint_error", formatResponse.checkpointCreationError(String(e)))
		}
	}

	/**
	 * Compares the current state with a checkpoint.
	 */
	public async compareWithCheckpoint(options?: CheckpointDiffOptions): Promise<void> {
		if (!this.activeTask || !this.taskId) {
			this.log("No active task")
			return
		}

		try {
			this.log("Comparing with checkpoint")
			if (CHECKPOINTS_REPOSITORY_SPECIFIC) {
				await this.diffViewProvider.openDiff({ fromFile: "", toFile: "", diff: "--pending--" })
			}
			const displayMessage = await checkpointDiff(this.taskId, options)
			this.say("checkpoint_diff", displayMessage)
		} catch (e) {
			this.log("Error comparing with checkpoint", e)
			this.say("checkpoint_error", formatResponse.checkpointComparisonError(String(e)))
		}
	}

	/**
	 * Restores a checkpoint.
	 */
	public async restoreCheckpoint(options?: CheckpointRestoreOptions): Promise<void> {
		if (!this.activeTask || !this.taskId) {
			this.log("No active task")
			return
		}

		try {
			this.log("Restoring checkpoint")
			const displayMessage = await checkpointRestore(this.taskId, options)
			this.say("checkpoint_restored", displayMessage)
		} catch (e) {
			this.log("Error restoring checkpoint", e)
			this.say("checkpoint_error", formatResponse.checkpointRestoreError(String(e)))
		}
	}

	/**
	 * Gets a summary of the conversation.
	 */
	public async getConversationSummary(): Promise<string | undefined> {
		if (!this.activeTask) {
			this.log("No active task")
			return
		}

		try {
			this.log("Getting conversation summary")
			const messages = this.activeTask.clineMessages
			if (messages.length === 0) {
				return "No messages in the conversation."
			}

			// Conversation metadata
			const meta = await taskMetadata(this.activeTask.taskId, this.globalStoragePath).get()
			const createdTime = meta?.created ?? new Date().toISOString()
			const created = new Date(createdTime)
			const now = new Date()
			const elapsedMs = now.getTime() - created.getTime()
			const elapsedMinutes = Math.floor(elapsedMs / 1000 / 60)

			// Metrics
			const messageCount = messages.length
			const userMessages = messages.filter((m) => m.role === "user").length
			const assistantMessages = messages.filter((m) => m.role === "assistant").length
			const taskDuration = this.activeTask.getDurationMs()
			const metrics = this.activeTask.toolUsage
			const toolUsage = Object.entries(metrics).map(([name, usage]) => ({
				name,
				attempts: usage.attempts,
				failures: usage.failures,
			}))
			toolUsage.sort((a, b) => b.attempts - a.attempts)

			// Topic summary
			const topicSummary = await getTopicsSummary({
				messages,
				provider: this.apiConfiguration,
				mode: this.mode,
			})

			const summary = formatSummary({
				conversationId: this.activeTask.taskId,
				taskNumber: this.activeTask.taskNumber,
				created,
				elapsedMinutes,
				messageCount,
				userMessages,
				assistantMessages,
				taskDuration,
				toolUsage,
				topicSummary,
			})

			return summary
		} catch (e) {
			this.log("Error getting conversation summary", e)
			return "Failed to generate conversation summary."
		}
	}

	/**
	 * Adds a listener to events from the ClineProvider.
	 */
	public on<K extends keyof ClineEvents>(
		event: K,
		listener: (...args: ClineEvents[K]) => void,
	): this {
		this.emitter.on(event, listener)
		return this
	}

	/**
	 * Removes a listener from events from the ClineProvider.
	 */
	public off<K extends keyof ClineEvents>(
		event: K,
		listener: (...args: ClineEvents[K]) => void,
	): this {
		this.emitter.off(event, listener)
		return this
	}

	/**
	 * Emit an event to all listeners.
	 */
	public emit<K extends keyof ClineEvents>(
		event: K,
		...args: ClineEvents[K]
	): boolean {
		return this.emitter.emit(event, ...args)
	}

	/**
	 * Send initialize message to the webview.
	 */
	public initialize(): void {
		if (this.onInitializeCallback) {
			const data: ClineInitialize = {
				mode: this.mode,
				modeTitle: this.getModeTitle(),
				showCode: this.mode === "code",
				activeTaskId: this.taskId,
				apiProvider: this.apiConfiguration?.apiProvider,
				apiConfiguration: this.apiConfiguration,
				systemPrompt: {
					customInstructions: this.customInstructions,
				},
			}
			this.onInitializeCallback(data)
		}
	}
}