"""AI routes — free-form text parsing, tag suggestion, model listing."""
import aiohttp
from fastapi import APIRouter, Query, Depends, Header, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.rate_limit import rate_limiter
from app.services.ai_service import AIService
from app.services.settings_service import SettingsService

router = APIRouter()

# AI endpoints call an external, billed LLM (or, for /ai/models, the
# provider's API) — rate-limited per account so a runaway frontend loop or
# a malicious/careless caller can't silently burn through the API budget.
_ai_generate_rate_limit = rate_limiter("ai_generate", max_requests=10, window_seconds=60)
_ai_models_rate_limit = rate_limiter("ai_models", max_requests=20, window_seconds=60)


@router.post("/ai/parse")
async def parse_tasks_with_ai(request: dict, db: AsyncSession = Depends(get_db), _rl: int = Depends(_ai_generate_rate_limit)):
    """Parse free-form text into tasks using AI."""

    text = request.get("text", "")
    if not text:
        raise HTTPException(status_code=400, detail="Text is required")
    settings = await SettingsService.get_many(db, ["ai_api_key", "ai_provider", "ai_model", "ai_custom_endpoint"])
    api_key = settings.get("ai_api_key", "")
    provider = settings.get("ai_provider") or "openrouter"
    model = settings.get("ai_model") or "openrouter/free"
    custom_endpoint = settings.get("ai_custom_endpoint", "")

    if not api_key and provider != "custom":
        raise HTTPException(status_code=400, detail="AI API key не настроен. Перейдите в Настройки → Интеграции")
    if provider == "custom" and not custom_endpoint:
        raise HTTPException(status_code=400, detail="Custom endpoint не настроен. Перейдите в Настройки → Интеграции")

    ai = AIService(api_key=api_key, model=model, provider=provider, custom_endpoint=custom_endpoint)
    tasks = await ai.parse_tasks_from_text(text)
    return {"tasks": tasks}


@router.post("/ai/suggest-tags")
async def suggest_tags_with_ai(request: dict, db: AsyncSession = Depends(get_db), _rl: int = Depends(_ai_generate_rate_limit)):
    """Suggest tags for a task using AI."""

    title = request.get("title", "")
    description = request.get("description", "")
    if not title:
        raise HTTPException(status_code=400, detail="Title is required")

    settings = await SettingsService.get_many(db, ["ai_api_key", "ai_provider", "ai_model", "ai_custom_endpoint"])
    api_key = settings.get("ai_api_key", "")
    provider = settings.get("ai_provider") or "openrouter"
    model = settings.get("ai_model") or "openrouter/free"
    custom_endpoint = settings.get("ai_custom_endpoint", "")

    if not api_key and provider != "custom":
        raise HTTPException(status_code=400, detail="AI API key не настроен. Перейдите в Настройки → Интеграции")
    if provider == "custom" and not custom_endpoint:
        raise HTTPException(status_code=400, detail="Custom endpoint не настроен. Перейдите в Настройки → Интеграции")

    ai = AIService(api_key=api_key, model=model, provider=provider, custom_endpoint=custom_endpoint)
    tags = await ai.suggest_tags(title, description)
    return {"tags": tags}


@router.get("/ai/models")
async def get_ai_models(
    provider: str = Query("openrouter"),
    api_key: str = Query(""),
    custom_endpoint: str = Query(""),
    include_free: bool = Query(True),
    include_paid: bool = Query(True),
    x_api_key: str = Header(None),
    db: AsyncSession = Depends(get_db),
    _rl: int = Depends(_ai_models_rate_limit),
):
    """Get models from AI provider. Accepts query params for dynamic configuration."""
    if not api_key and provider != "custom":
        api_key = x_api_key or ""
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
                    timeout=aiohttp.ClientTimeout(total=15)
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
                            is_truly_free = prompt_price == "0" and completion_price == "0"
                            is_named_free = model_id.endswith(":free") or ":free" in model_id.lower()

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
            elif provider == "openai":
                async with session.get(
                    "https://api.openai.com/v1/models",
                    headers=headers,
                    timeout=aiohttp.ClientTimeout(total=15)
                ) as resp:
                    if resp.status == 200:
                        data = await resp.json()
                        models = [m["id"] for m in data.get("data", [])]
                        return {"models": models, "provider": provider}
                    return {"models": ["gpt-4o-mini", "gpt-4o", "gpt-4-turbo", "gpt-3.5-turbo"], "provider": provider}
            elif provider == "anthropic":
                return {
                    "models": ["claude-3-haiku", "claude-3-sonnet", "claude-3-opus", "claude-3-5-sonnet-20241022"],
                    "free_models": ["claude-3-haiku"],
                    "paid_models": ["claude-3-sonnet", "claude-3-opus", "claude-3-5-sonnet-20241022"],
                    "provider": provider,
                }
            elif provider == "custom":
                base = custom_endpoint.rstrip("/")
                async with session.get(
                    f"{base}/v1/models",
                    headers=headers,
                    timeout=aiohttp.ClientTimeout(total=60)
                ) as resp:
                    if resp.status == 200:
                        data = await resp.json()
                        models = [m["id"] for m in data.get("data", [])]
                        return {"models": models, "provider": provider}
                    return {"models": [], "error": f"Custom endpoint returned {resp.status}", "provider": provider}
            return {"models": [], "provider": provider}
    except Exception as e:
        return {"models": [], "error": str(e), "provider": provider}
