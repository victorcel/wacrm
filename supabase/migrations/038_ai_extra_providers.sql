-- ============================================================
-- 038_ai_extra_providers.sql — add "nvidia" and "ollama" as supported
-- AI providers
--
-- Adds NVIDIA NIM (OpenAI-compatible chat completions) and Ollama Cloud
-- (native chat API) alongside the existing OpenAI/Anthropic BYO-key
-- providers. Widens the two provider CHECK constraints from
-- 032_ai_reply / 037_ai_reply_polish.
--
-- Idempotent — safe to run multiple times.
-- ============================================================

ALTER TABLE ai_configs
  DROP CONSTRAINT IF EXISTS ai_configs_provider_check;
ALTER TABLE ai_configs
  ADD CONSTRAINT ai_configs_provider_check
    CHECK (provider IN ('openai', 'anthropic', 'nvidia', 'ollama'));

ALTER TABLE ai_usage_log
  DROP CONSTRAINT IF EXISTS ai_usage_log_provider_check;
ALTER TABLE ai_usage_log
  ADD CONSTRAINT ai_usage_log_provider_check
    CHECK (provider IN ('openai', 'anthropic', 'nvidia', 'ollama'));
