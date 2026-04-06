import { createOpenRouter } from '@openrouter/ai-sdk-provider'
import { generateText } from 'ai'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
}

const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY!
})

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders })
}

/**
 * Single-reply draft for the open DM thread (composer assist).
 * Body: { messages: string[] } — recent messages from the thread, newest last.
 */
export async function POST(req: Request) {
  const body = await req.json()
  const messages = Array.isArray(body.messages) ? body.messages : []

  if (messages.length === 0) {
    return Response.json(
      { text: '', error: 'no_messages' },
      { status: 400, headers: corsHeaders }
    )
  }

  const { text } = await generateText({
    model: openrouter('nvidia/llama-3.1-nemotron-70b-instruct'),
    prompt: `You are Magnus, drafting a reply for a founder/builder on X (Twitter) DMs.

Below are messages from the conversation (other party and/or the user). Write ONE reply the account owner could send next.

Rules:
- Sound human, concise, and appropriate to the last messages.
- Do not be preachy or salesy unless the thread is sales-related.
- No hashtags. No "As an AI".
- Output ONLY the reply text. No quotes, no markdown, no JSON.

Messages (JSON array of strings, order may be mixed):
${JSON.stringify(messages)}`
  })

  const reply = text.replace(/```[\s\S]*?```/g, '').trim()
  return Response.json({ text: reply }, { headers: corsHeaders })
}
