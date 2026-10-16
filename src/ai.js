// Клиент для OpenAI-совместимого API (POST {baseUrl}/chat/completions)
export function createAiClient({
  baseUrl,
  apiKey,
  model,
  maxTokens,
  timeoutMs = 45_000,
  fetchImpl = fetch,
}) {
  return {
    async complete(messages, { temperature = 0.6 } = {}) {
      const response = await fetchImpl(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ model, messages, max_tokens: maxTokens, temperature }),
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (!response.ok) {
        const body = await response.text().catch(() => '');
        throw new Error(`AI HTTP ${response.status}: ${body.slice(0, 300)}`);
      }

      const data = await response.json();
      const text = data?.choices?.[0]?.message?.content?.trim();
      if (!text) throw new Error('AI вернул пустой ответ');
      return text;
    },
  };
}
