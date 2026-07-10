import { AiError, type ProviderResult } from '../types'
import { MAX_OUTPUT_TOKENS } from '../defaults'
import {
  mergeConsecutive,
  normalizeUsage,
  providerHttpError,
  toNetworkError,
  type ProviderArgs,
} from './shared'

const OLLAMA_URL = process.env.OLLAMA_URL || 'https://ollama.com/api/chat'

interface OllamaResponse {
  message?: { content?: string }
  prompt_eval_count?: number
  eval_count?: number
}

/**
 * Call Ollama Cloud's native Chat endpoint with the caller's own key.
 * Unlike the OpenAI/NVIDIA adapters, Ollama uses its own request/response
 * shape (`message.content`, `prompt_eval_count`/`eval_count`) rather than
 * the OpenAI schema. Returns the raw assistant text + token usage
 * (handoff parsing happens in `generateReply`).
 */
export async function generateOllama(args: ProviderArgs): Promise<ProviderResult> {
  const { apiKey, model, systemPrompt, messages, timeoutMs } = args

  let res: Response
  try {
    res = await fetch(OLLAMA_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          ...mergeConsecutive(messages),
        ],
        stream: false,
        options: { num_predict: MAX_OUTPUT_TOKENS },
      }),
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch (err) {
    throw toNetworkError(err)
  }

  if (!res.ok) {
    throw await providerHttpError('Ollama', res)
  }

  const data = (await res.json().catch(() => null)) as OllamaResponse | null
  const text = data?.message?.content
  if (!text || typeof text !== 'string' || !text.trim()) {
    throw new AiError('Ollama returned an empty response.', {
      code: 'empty_response',
    })
  }
  const usage = normalizeUsage({
    prompt: data?.prompt_eval_count,
    completion: data?.eval_count,
  })
  return { text, usage }
}
