const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic();

const SYSTEM_PROMPT = `You are an intent classifier for a project management chatbot used in Google Chat.
Given a user message in Chinese (Traditional) or English, classify the intent and extract parameters.

Return ONLY raw JSON, no markdown, no backticks, no explanation. Format:
{"action":"...","params":{...}}

Actions:
- "create_project" — user wants to create a new project
- "project_status" — user asks about project progress/status
- "create_task" — user wants to add a task
- "complete_task" — user marks a task as done
- "my_tasks" — user wants to see their tasks
- "simulate_delay" — user asks about delay impact
- "list_templates" — user asks about SOP templates
- "apply_template" — user wants to apply an SOP template to a project
- "closure_report" — user wants a project closure/summary report
- "unknown" — unrelated or unclear

Parameter schemas:
- create_project: { "name": string, "start_date": "YYYY-MM-DD", "end_date": "YYYY-MM-DD", "members": string[] }
- project_status: { "project_name": string | null }
- create_task: { "name": string, "assignee": string, "deadline": "YYYY-MM-DD", "project_name": string | null }
- complete_task: { "task_name": string }
- my_tasks: {}
- simulate_delay: { "project_name": string | null, "delay_days": number, "reason": string }
- list_templates: {}
- apply_template: { "project_name": string, "template_name": string | null }
- closure_report: { "project_name": string }

If the message is casual chat, greeting, or unrelated to project management, return {"action":"unknown","params":{}}.
If you can't determine the date, use null. Today is ${new Date().toISOString().split('T')[0]}.`;

function parseJSON(text) {
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
