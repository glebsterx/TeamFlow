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
            raise AIServiceModelError("AI API request timed out (30s)")
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
        
        Returns list of tag strings.
        Raises AIServiceModelError if AI fails.
        """
        text = f"Задача: {title}"
        if description:
            text += f"\nОписание: {description}"

        system_prompt = """Предложи 2-4 тега для этой задачи из списка: work, personal, urgent, meeting, docs, code, review, plan.
Верни JSON массив строк (названия тегов)."""

        result = await self._call_api(text, system_prompt)

        try:
            result = result.strip()
            if "```json" in result:
                result = result.split("```json")[1].split("```")[0]
            elif "```" in result:
                result = result.split("```")[1].split("```")[0]

            tags = json.loads(result)
            if isinstance(tags, list):
                return [t for t in tags if isinstance(t, str)]
            raise AIServiceModelError("AI response is not a list of tags")
        except json.JSONDecodeError as e:
            logger.error("ai_tag_json_error", error=str(e))
            raise AIServiceJSONError(f"Failed to parse AI tags response as JSON: {str(e)}")


async def get_ai_service(db: AsyncSession) -> AIService:
    """Get AI service instance with config from database."""
    from app.repositories.auth import AccountRepository
    from app.services.settings_service import SettingsService

    # Get AI settings from database
    settings = SettingsService()
    api_key = await settings.get(db, "ai_api_key")
    
    if api_key:
        from app.services.crypto_service import decrypt_value
        api_key = decrypt_value(api_key)

    model = await settings.get(db, "ai_model") or "meta-llama/llama-3.1-8b-instruct"

    return AIService(api_key=api_key, model=model)