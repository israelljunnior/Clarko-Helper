import { useCallback, useEffect, useRef, useState } from 'react'
import type { InsightMessage, InsightsService } from '../services/insightsService'

export interface ChatMessage extends InsightMessage {
  id: number
  /** True while Clarko's message is still arriving. */
  streaming?: boolean
}

/**
 * The conversation in one insights popup: Clarko's first thoughts about the paragraph arrive as soon as
 * it opens, then each question the author sends gets a streamed answer. Everything in flight is
 * cancelled when the popup closes.
 */
export function useInsightsChat(service: InsightsService, paragraph: string, context: string) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [streaming, setStreaming] = useState(false)
  const [failed, setFailed] = useState(false)

  const messagesRef = useRef<ChatMessage[]>([])
  const inFlight = useRef<AbortController | null>(null)
  const nextId = useRef(1)

  const commit = useCallback((next: ChatMessage[]) => {
    messagesRef.current = next
    setMessages(next)
  }, [])

  /** Streams Clarko's answer to the conversation so far into a new message. */
  const answer = useCallback(
    async (history: ChatMessage[]) => {
      inFlight.current?.abort()
      const controller = new AbortController()
      inFlight.current = controller

      const id = nextId.current++
      let text = ''
      commit([...history, { id, role: 'clarko', content: '', streaming: true }])
      setStreaming(true)
      setFailed(false)

      const update = (content: string, streamingNow: boolean) =>
        commit(messagesRef.current.map((m) => (m.id === id ? { ...m, content, streaming: streamingNow } : m)))

      try {
        const conversation = { context, history: history.map(({ role, content }) => ({ role, content })) }
        for await (const chunk of service.stream(paragraph, conversation, controller.signal)) {
          text += chunk
          update(text, true)
        }
        update(text.trim(), false)
      } catch {
        if (controller.signal.aborted) return
        // Keep whatever arrived; drop the bubble if nothing did.
        if (text) update(text.trim(), false)
        else commit(messagesRef.current.filter((m) => m.id !== id))
        setFailed(true)
      } finally {
        if (inFlight.current === controller) {
          inFlight.current = null
          setStreaming(false)
        }
      }
    },
    [commit, context, paragraph, service],
  )

  // Clarko's first thoughts, as soon as the popup opens.
  useEffect(() => {
    void answer([])
    return () => inFlight.current?.abort()
  }, [answer])

  const send = useCallback(
    (question: string) => {
      const content = question.trim()
      if (!content || inFlight.current) return
      const history: ChatMessage[] = [...messagesRef.current, { id: nextId.current++, role: 'author', content }]
      void answer(history)
    },
    [answer],
  )

  /** Asks again for the last answer, e.g. after a failure. */
  const retry = useCallback(() => {
    const history = messagesRef.current
    const lastAuthor = history.findLastIndex((m) => m.role === 'author')
    void answer(lastAuthor === -1 ? [] : history.slice(0, lastAuthor + 1))
  }, [answer])

  return { messages, streaming, failed, send, retry }
}
