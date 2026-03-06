const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic();

const SYSTEM_PROMPT = `You are an intent classifier for a project management chatbot used in Google Chat.
Given a user message in Chinese (Traditional) or English, classify the intent and extract parameters.

Return ONLY raw JSON, no markdown, no backticks, no explanation. Format:
{"action":"...","params":{...}}

Actions: "create_project", "project_status", "create_task", "complete_task", "my_tasks", "simulate_delay", "unknown"

Parameter schemas:
- create_project: { "name": string, "start_date": "YYYY-MM-DD", "end_date": "YYYY-MM-DD", "members": string[] }
- project_status: { "project_name": string | null }
- create_task: { "name": string, "assignee": string, "deadline": "YYYY-MM-DD", "project_name": string | null }
- complete_task: { "task_name": string }
- my_tasks: {}
- simulate_delay: { "project_name": string | null, "delay_days": number, "reason": string }

If the message is casual chat, greeting, or unrelated to project management, return {"action":"unknown","params":{}}.
If you can't determine the date, use null. Today is ${new Date().toISOString().split('T')[0]}.`;

function parseJSON(text) {
  // Strip markdown code blocks if present
  const cleaned = text.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/, '').trim();
  return JSON.parse(cleaned);
}

async function analyzeIntent(text) {
  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: text }],
    });

    const content = response.content[0].text;
    return parseJSON(content);
  } catch (err) {
    console.error('[INTENT] Failed to classify:', err.message);
    return { action: 'unknown', params: {} };
  }
}

module.exports = { analyzeIntent };
