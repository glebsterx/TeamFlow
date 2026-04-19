"""AI service for task parsing and splitting."""
import json
import asyncio
from typing import List, Optional, Dict, Any
import aiohttp
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.logging import get_logger

logger = get_logger(__name__)


class AIServiceError(Exception):
    """Base exception for AI service errors."""
    pass


class AIServiceModelError(AIServiceError):
    """Raised when the AI model returns an error or empty response."""
    pass


class AIServiceJSONError(AIServiceError):
    """Raised when AI response cannot be parsed as valid JSON."""
    pass


class AIService:
    """AI-powered task parsing and splitting."""

    def __init__(self, api_key: Optional[str] = None, model: str = "openrouter/free", provider: str = "openrouter", custom_endpoint: str = ""):
        self.api_key = api_key
        self.model = model
        self.provider = provider
        self.custom_endpoint = custom_endpoint
        if provider == "custom" and custom_endpoint:
            self.base_url = custom_endpoint.rstrip("/") + "/v1"
        elif provider == "openrouter":
            self.base_url = "https://openrouter.ai/api/v1"
        elif provider == "openai":
            self.base_url = "https://api.openai.com/v1"
        elif provider == "anthropic":
            self.base_url = "https://api.anthropic.com"
        else:
            self.base_url = "https://openrouter.ai/api/v1"

    async def fetch_models_list(
        self,
        *,
        include_free: bool = True,
        include_paid: bool = True,
    ) -> dict[str, Any]:
        """List models for the configured provider (GET /api/ai/models)."""
        provider = self.provider
        api_key = self.api_key or ""
        custom_endpoint = self.custom_endpoint

        if not api_key and provider != "custom":
            return {"models": [], "error": "API key required"}
        if provider == "custom" and not custom_endpoint:
            return {"models": [], "error": "Custom endpoint required"}

        try:
            async with aiohttp.ClientSession() as session:
                headers = {"Authorization": f"Bearer {api_key}"} if api_key else {}
                if provider == "openrouter":
                    async with session.get(
                        "https://openrouter.ai/api/v1/models",
                        headers=headers,
                        timeout=aiohttp.ClientTimeout(total=15),
                    ) as resp:
                        if resp.status == 200:
                            data = await resp.json()
                            all_models = data.get("data", [])

                            free_models = []
                            paid_models = []

                            for m in all_models:
                                model_id = m.get("id", "")
                                pricing = m.get("pricing", {})
                                prompt_price = str(pricing.get("prompt", ""))
                                completion_price = str(pricing.get("completion", ""))
                                is_truly_free = (
                                    prompt_price == "0" and completion_price == "0"
                                )
                                is_named_free = model_id.endswith(
                                    ":free"
                                ) or ":free" in model_id.lower()

                                if is_truly_free or is_named_free:
                                    free_models.append(model_id)
                                elif include_paid:
                                    paid_models.append(model_id)

                            result_models = []
                            if include_free:
                                result_models.extend(sorted(free_models))
                            if include_paid:
                                result_models.extend(sorted(paid_models))

                            return {
                                "models": result_models,
                                "free_count": len(free_models),
                                "paid_count": len(paid_models),
                                "provider": provider,
                                "free_models": sorted(free_models),
                                "paid_models": sorted(paid_models),
                            }
                        return {"models": [], "provider": provider}
                if provider == "openai":
                    async with session.get(
                        "https://api.openai.com/v1/models",
                        headers=headers,
                        timeout=aiohttp.ClientTimeout(total=15),
                    ) as resp:
                        if resp.status == 200:
                            data = await resp.json()
                            models = [m["id"] for m in data.get("data", [])]
                            return {"models": models, "provider": provider}
                        return {
                            "models": [
                                "gpt-4o-mini",
                                "gpt-4o",
                                "gpt-4-turbo",
                                "gpt-3.5-turbo",
                            ],
                            "provider": provider,
                        }
                if provider == "anthropic":
                    return {
                        "models": [
                            "claude-3-haiku",
                            "claude-3-sonnet",
                            "claude-3-opus",
                            "claude-3-5-sonnet-20241022",
                        ],
                        "free_models": ["claude-3-haiku"],
                        "paid_models": [
                            "claude-3-sonnet",
                            "claude-3-opus",
                            "claude-3-5-sonnet-20241022",
                        ],
                        "provider": provider,
                    }
                if provider == "custom":
                    base = custom_endpoint.rstrip("/")
                    async with session.get(
                        f"{base}/v1/models",
                        headers=headers,
                        timeout=aiohttp.ClientTimeout(total=60),
                    ) as resp:
                        if resp.status == 200:
                            data = await resp.json()
                            models = [m["id"] for m in data.get("data", [])]
                            return {"models": models, "provider": provider}
                        return {
                            "models": [],
                            "error": f"Custom endpoint returned {resp.status}",
                            "provider": provider,
                        }
                return {"models": [], "provider": provider}
        except Exception as e:
            return {"models": [], "error": str(e), "provider": provider}

    async def _call_api(self, prompt: str, system_prompt: str) -> Optional[str]:
        """Make API call to AI provider."""
        if not self.api_key and self.provider != "custom":
            logger.warning("ai_service_no_api_key")
            return None

        headers = {
            "Authorization": f"Bearer {self.api_key}" if self.api_key else "",
            "Content-Type": "application/json",
        }
        
        # Add OpenRouter-specific headers only for openrouter
        if self.provider == "openrouter":
            headers["HTTP-Referer"] = "https://teamflow.local"
            headers["X-Title"] = "TeamFlow"
        
        # Remove empty Authorization header for custom endpoints without key
        if not self.api_key:
            del headers["Authorization"]
            
        logger.info("ai_request", model=self.model, provider=self.provider, key_prefix=self.api_key[:10] if self.api_key else None)

        payload = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": prompt}
            ],
            "temperature": 0.3,
        }

        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    f"{self.base_url}/chat/completions",
                    headers=headers,
                    json=payload,
                    timeout=aiohttp.ClientTimeout(total=90)
                ) as resp:
                    if resp.status == 200:
                        data = await resp.json()
                        content = data["choices"][0]["message"]["content"]
                        if not content or not content.strip():
                            raise AIServiceModelError("AI model returned empty response")
                        return content
                    else:
                        error_text = await resp.text()
                        logger.error("ai_api_error", status=resp.status, response=error_text)
                        if resp.status == 429:
                            raise AIServiceModelError("Лимит бесплатных запросов исчерпан. Перейдите в Настройки → Интеграции для выбора другой модели или добавьте кредиты.")
                        raise AIServiceModelError(f"AI API error {resp.status}: {error_text}")
        except asyncio.TimeoutError:
            logger.error("ai_api_timeout")
            raise AIServiceModelError("AI API request timed out (90s)")
        except aiohttp.ClientError as e:
            logger.error("ai_api_client_error", error=str(e))
            raise AIServiceModelError(f"AI API connection error: {str(e)}")
        except KeyError as e:
            logger.error("ai_api_response_parse_error", error=str(e))
            raise AIServiceModelError(f"Unexpected AI API response format: missing {str(e)}")

    async def parse_tasks_from_text(self, text: str) -> List[Dict[str, Any]]:
        """Parse text and extract tasks.
        
        Returns list of dicts: {title, description?, priority?, due_date?}
        Raises AIServiceModelError if AI fails or returns invalid data.
        """
        from datetime import date
        today = date.today().isoformat()
        
        system_prompt = f"""Сегодня {today}.
Ты парсишь текст и извлекаешь задачи. Верни JSON массив.
Каждая задача: title (обязательно), description, priority, due_date.

Приоритеты: URGENT, HIGH, NORMAL, LOW.
Если в тексте нет явных задач - создай одну на основе текста.
НИКОГДА не возвращай пустой массив - всегда минимум 1 задача.

Ответ строго JSON массив."""

        result = await self._call_api(text, system_prompt)

        try:
            # Try to extract JSON from response
            result = result.strip()
            if "```json" in result:
                result = result.split("```json")[1].split("```")[0]
            elif "```" in result:
                result = result.split("```")[1].split("```")[0]
            
            tasks = json.loads(result)
            if isinstance(tasks, list):
                # Remove internal id fields, ensure non-empty
                cleaned = []
                for t in tasks:
                    if isinstance(t, dict) and t.get("title"):
                        cleaned.append({
                            k: v for k, v in t.items()
                            if k != "id"
                        })
                # Fallback: if empty, create from original text
                if not cleaned:
                    cleaned = [{"title": text[:200]}]
                return cleaned
            raise AIServiceModelError("AI response is not a list of tasks")
        except json.JSONDecodeError as e:
            logger.error("ai_parse_json_error", error=str(e), response=result[:200])
            raise AIServiceJSONError(f"Failed to parse AI response as JSON: {str(e)}")

    async def split_task_into_subtasks(self, task_title: str, task_description: Optional[str] = None) -> List[str]:
        """Split large task into smaller subtasks.
        
        Returns list of subtask titles.
        Raises AIServiceModelError if AI fails.
        """
        text = f"Задача: {task_title}"
        if task_description:
            text += f"\nОписание: {task_description}"

        system_prompt = """Ты — ассистент по разбиению задач. Большую задачу нужно разбить на 3-7 подзадач.
Верни JSON массив строк (названия подзадач).

Пример:
Задача: "Сделать сайт"
Ответ: ["Нарисовать дизайн", "Верстка HTML/CSS", "Написать backend", "Настроить хостинг", "Наполнить контент"]"""

        result = await self._call_api(text, system_prompt)

        try:
            result = result.strip()
            if "```json" in result:
                result = result.split("```json")[1].split("```")[0]
            elif "```" in result:
                result = result.split("```")[1].split("```")[0]

            subtasks = json.loads(result)
            if isinstance(subtasks, list):
                return [s for s in subtasks if isinstance(s, str)]
            raise AIServiceModelError("AI response is not a list of subtask titles")
        except json.JSONDecodeError as e:
            logger.error("ai_split_json_error", error=str(e))
            raise AIServiceJSONError(f"Failed to parse AI subtask response as JSON: {str(e)}")

    async def suggest_tags(self, title: str, description: Optional[str] = None) -> List[str]:
        """Suggest tags for a task based on its content.
        
        Returns list of short Russian tag labels.
        Raises AIServiceModelError if AI fails.
        """
        text = f"Задача: {title}"
        if description:
            text += f"\nОписание: {description}"

        system_prompt = """Ты помощник для таск-трекера. По названию и описанию задачи предложи 2–4 коротких тега
на русском языке (одно-два слова: существительные или прилагательные, без # и без эмодзи).
Теги должны отражать тему, тип работы или срочность (примеры: «документация», «баг», «встреча», «срочно», «бэкенд», «ревью»).

Верни строго JSON-массив строк — только русские подписи тегов, без дубликатов."""

        result = await self._call_api(text, system_prompt)

        try:
            result = result.strip()
            if "```json" in result:
                result = result.split("```json")[1].split("```")[0]
            elif "```" in result:
                result = result.split("```")[1].split("```")[0]

            tags = json.loads(result)
            if isinstance(tags, list):
                return [
                    t.strip()
                    for t in tags
                    if isinstance(t, str) and t.strip()
                ]
            raise AIServiceModelError("AI response is not a list of tags")
        except json.JSONDecodeError as e:
            logger.error("ai_tag_json_error", error=str(e))
            raise AIServiceJSONError(f"Failed to parse AI tags response as JSON: {str(e)}")


async def get_ai_service(db: AsyncSession) -> AIService:
    """Build AIService from app_settings (same keys as POST /api/ai/parse)."""
    from app.services.settings_service import SettingsService

    vals = await SettingsService.get_many(
        db,
        ["ai_api_key", "ai_provider", "ai_model", "ai_custom_endpoint"],
    )
    api_key = vals.get("ai_api_key") or ""
    provider = vals.get("ai_provider") or "openrouter"
    model = vals.get("ai_model") or "openrouter/free"
    custom_endpoint = vals.get("ai_custom_endpoint") or ""

    return AIService(
        api_key=api_key,
        model=model,
        provider=provider,
        custom_endpoint=custom_endpoint,
    )