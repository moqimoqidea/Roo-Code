import { Anthropic } from "@anthropic-ai/sdk"
import { ToolName } from "@roo-code/types"

/**
 * Represents a tool use being streamed from Anthropic's API
 */
export interface StreamingToolUse {
    id: string
    name: string
    input: any
    isComplete: boolean
    accumulatedJson?: string
}

/**
 * Handles Anthropic's native tool use functionality
 * Converts between Anthropic's tool format and our internal XML format
 */
export class AnthropicToolHandler {
    private streamingToolUses: Map<string, StreamingToolUse> = new Map()
    private currentStreamingToolId: string | null = null
    private toolNameToIdMap: Map<string, string> = new Map()

    /**
     * Handles the start of a tool use
     */
    handleToolUseStart(id: string, name: string, input: any): void {
        this.currentStreamingToolId = id
        this.streamingToolUses.set(id, {
            id,
            name,
            input: input || {},
            isComplete: false,
            accumulatedJson: ''
        })
    }

    /**
     * Handles delta updates for tool use input
     */
    handleToolUseDelta(partialJson: string): void {
        if (!this.currentStreamingToolId) {
            console.warn('Received tool use delta without active tool use')
            return
        }

        const toolUse = this.streamingToolUses.get(this.currentStreamingToolId)
        if (!toolUse) {
            console.warn(`Tool use ${this.currentStreamingToolId} not found`)
            return
        }

        // Accumulate the partial JSON
        toolUse.accumulatedJson = (toolUse.accumulatedJson || '') + partialJson

        // Try to parse the accumulated JSON
        try {
            const parsedInput = JSON.parse(toolUse.accumulatedJson)
            toolUse.input = parsedInput
        } catch (e) {
            // JSON is not complete yet, continue accumulating
        }
    }

    /**
     * Converts Anthropic tool use JSON to XML format
     * Preserves the tool_use_id for later reference
     */
    convertToolUseToXml(toolUse: StreamingToolUse): string {
        const { name, input, id } = toolUse
        
        // Store the mapping for later retrieval
        this.toolNameToIdMap.set(name, id)
        
        // Store the tool_use_id as a comment for later retrieval
        let xml = `<!-- tool_use_id: ${id} -->\n`
        xml += `<${name}>\n`
        
        // Convert input object to XML parameters
        for (const [key, value] of Object.entries(input)) {
            xml += `<${key}>\n${String(value)}\n</${key}>\n`
        }
        
        xml += `</${name}>`
        
        return xml
    }

    /**
     * Extracts tool_use_id from XML comment
     */
    extractToolUseId(xml: string): string | null {
        const match = xml.match(/<!-- tool_use_id: (.+?) -->/)
        return match ? match[1] : null
    }

    /**
     * Converts tool result to Anthropic's expected format
     */
    createToolResult(toolUseId: string, content: string | any[]): Anthropic.ToolResultBlockParam {
        // Handle different content types
        let formattedContent: string | Anthropic.Messages.ContentBlockParam[]
        
        if (typeof content === 'string') {
            formattedContent = content
        } else if (Array.isArray(content)) {
            // Convert array of content blocks to Anthropic format
            formattedContent = content.map(block => {
                if (typeof block === 'string') {
                    return { type: 'text' as const, text: block }
                }
                return block
            })
        } else {
            formattedContent = String(content)
        }

        return {
            type: 'tool_result',
            tool_use_id: toolUseId,
            content: formattedContent
        }
    }

    /**
     * Gets all completed tool uses and clears the buffer
     */
    getCompletedToolUses(): StreamingToolUse[] {
        const completed = Array.from(this.streamingToolUses.values())
            .filter(toolUse => toolUse.isComplete)
        
        // Clear completed tool uses
        completed.forEach(toolUse => this.streamingToolUses.delete(toolUse.id))
        
        return completed
    }

    /**
     * Marks a tool use as complete
     */
    markToolUseComplete(id: string): void {
        const toolUse = this.streamingToolUses.get(id)
        if (toolUse) {
            toolUse.isComplete = true
        }
    }

    /**
     * Marks all current tool uses as complete (called when stream ends)
     */
    markAllToolUsesComplete(): void {
        this.streamingToolUses.forEach(toolUse => {
            toolUse.isComplete = true
        })
        this.currentStreamingToolId = null
    }

    /**
     * Gets the tool_use_id for a given tool name and clears it after retrieval
     */
    getToolUseIdByName(toolName: string): string | null {
        const toolUseId = this.toolNameToIdMap.get(toolName) || null
        if (toolUseId) {
            // Clear after retrieval to avoid using the same ID twice
            this.toolNameToIdMap.delete(toolName)
        }
        return toolUseId
    }

    /**
     * Clears all streaming tool uses
     */
    clear(): void {
        this.streamingToolUses.clear()
        this.currentStreamingToolId = null
        this.toolNameToIdMap.clear()
    }
} 