import { describe, test, expect } from "vitest"
import { modelSupportsNativeToolCalling, getModelsWithNativeToolCalling } from "../model-detection"
import { CLAUDE_MODELS_WITH_TOOL_CALLING } from "../anthropic"

describe("Model detection for native tool calling", () => {
  test("correctly identifies supported Claude models", () => {
    // Test each model in the CLAUDE_MODELS_WITH_TOOL_CALLING list
    for (const model of CLAUDE_MODELS_WITH_TOOL_CALLING) {
      expect(modelSupportsNativeToolCalling("anthropic", model)).toBe(true)
    }
  })

  test("rejects unsupported Claude models", () => {
    expect(modelSupportsNativeToolCalling("anthropic", "claude-2")).toBe(false)
    expect(modelSupportsNativeToolCalling("anthropic", "claude-instant-1")).toBe(false)
  })

  test("identifies supported OpenAI models", () => {
    expect(modelSupportsNativeToolCalling("openai", "gpt-4")).toBe(true)
    expect(modelSupportsNativeToolCalling("openai", "gpt-4-turbo")).toBe(true)
    expect(modelSupportsNativeToolCalling("openai", "gpt-3.5-turbo")).toBe(true)
    expect(modelSupportsNativeToolCalling("openai", "gpt-3.5-turbo-0125")).toBe(true)
  })

  test("rejects unsupported OpenAI models", () => {
    expect(modelSupportsNativeToolCalling("openai", "davinci")).toBe(false)
    expect(modelSupportsNativeToolCalling("openai", "text-davinci-003")).toBe(false)
  })

  test("identifies supported Gemini models", () => {
    expect(modelSupportsNativeToolCalling("gemini", "gemini-pro")).toBe(true)
    expect(modelSupportsNativeToolCalling("gemini", "gemini-1.5-pro")).toBe(true)
    expect(modelSupportsNativeToolCalling("gemini", "gemini-1.5-flash")).toBe(true)
  })

  test("rejects unsupported Gemini models", () => {
    expect(modelSupportsNativeToolCalling("gemini", "gemini-nano")).toBe(false)
    expect(modelSupportsNativeToolCalling("gemini", "other-model")).toBe(false)
  })

  test("rejects models from unsupported providers", () => {
    expect(modelSupportsNativeToolCalling("mistral", "mistral-large")).toBe(false)
    expect(modelSupportsNativeToolCalling("ollama", "llama2")).toBe(false)
  })

  test("handles undefined model ID", () => {
    expect(modelSupportsNativeToolCalling("anthropic", undefined)).toBe(false)
    expect(modelSupportsNativeToolCalling("openai", undefined)).toBe(false)
  })

  test("getModelsWithNativeToolCalling returns all supported models", () => {
    const result = getModelsWithNativeToolCalling()
    
    expect(result).toHaveProperty("anthropic")
    expect(result).toHaveProperty("openai")
    expect(result).toHaveProperty("gemini")
    
    expect(result.anthropic).toEqual(CLAUDE_MODELS_WITH_TOOL_CALLING)
    expect(result.openai.length).toBeGreaterThan(0)
    expect(result.gemini.length).toBeGreaterThan(0)
  })
})