import { createOpenRouter } from '@openrouter/ai-sdk-provider'
import { generateText } from 'ai'

const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY!
})

export async function POST(req: Request) {
  const { messages } = await req.json()

  const { text } = await generateText({
    model: openrouter('nvidia/llama-3.1-nemotron-70b-instruct'),
    prompt: `You are Magnus, an AI DM assistant for founders and builders on X/Twitter.

Analyze these DMs and return ONLY a valid JSON object. No markdown, no explanation, just raw JSON.

Return this exact shape:
{
  "clusters": [
    {
      "clusterTitle": "short punchy title",
      "oneLiner": "one sentence summary of what these people want",
      "intentType": one of: "collab_pitch" | "intro_request" | "investor_sniff" | "recruiting" | "fan_message" | "friend_checkin" | "spam" | "customer",
      "senderType": one of: "founder" | "investor" | "recruiter" | "friend" | "spam" | "unknown",
      "opportunityScore": number 0-100,
      "opportunityReason": "one sentence explaining the score",
      "urgency": "high" | "medium" | "low",
      "urgencyTrigger": "why is this urgent, or null",
      "actionType": "reply_needed" | "safe_to_ignore" | "needs_intro" | "follow_up",
      "representativeMessages": ["up to 3 most important messages"],
      "unreadCount": number,
      "daysSinceLastReply": number or null,
      "suggestedReply": {
        "warm": "warm friendly version",
        "professional": "professional version",
        "brief": "short punchy version"
      },
      "followUpSuggestion": "what to do if no reply, or null",
      "confidence": number 0-1
    }
  ],
  "inboxHealthScore": number 0-100,
  "inboxHealthReason": "one sentence explaining the health score",
  "staledThreads": [
    {
      "name": "Person's name or handle",
      "daysSince": number,
      "lastMessage": "their last message",
      "revivalDraft": "a natural revival message"
    }
  ]
}

Messages to analyze:
${JSON.stringify(messages)}`
  })

  const clean = text.replace(/```json|```/g, '').trim()
  const parsed = JSON.parse(clean)

  return Response.json(parsed)
}