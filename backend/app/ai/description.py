"""Step 7b: title/description generation (Qwen3) from vision attributes."""
import os
import httpx

_openai_key = os.getenv("OPENAI_API_KEY", "")
_openrouter_key = os.getenv("OPENROUTER_API_KEY", "")
_groq_key = os.getenv("GROQ_API_KEY", "")

LLM_API_KEY = (
    os.getenv("LLM_API_KEY")
    or _openrouter_key
    or _groq_key
    or _openai_key
)

if not os.getenv("LLM_API_URL"):
    if _openrouter_key:
        LLM_API_URL = "https://openrouter.ai/api/v1"
    elif _groq_key:
        LLM_API_URL = "https://api.groq.com/openai/v1"
    elif _openai_key:
        LLM_API_URL = "https://api.openai.com/v1"
    else:
        LLM_API_URL = ""
else:
    LLM_API_URL = os.getenv("LLM_API_URL", "")

if not os.getenv("LLM_MODEL"):
    if "openrouter" in LLM_API_URL:
        LLM_MODEL = "qwen/qwen-2.5-vl-72b-instruct"
    elif "groq" in LLM_API_URL:
        LLM_MODEL = "llama-3.2-11b-vision-preview"
    elif "openai" in LLM_API_URL:
        LLM_MODEL = "gpt-4o-mini"
    elif "11434" in LLM_API_URL:
        LLM_MODEL = "llama3.2-vision"
    else:
        LLM_MODEL = "Qwen/Qwen3-VL-8B-Instruct"
else:
    LLM_MODEL = os.getenv("LLM_MODEL", "")

def generate_listing_text(attrs: dict) -> dict:
    fallback = {"title": " ".join(filter(None, [attrs.get("brand"), attrs.get("model") or attrs.get("product_type")])) or "",
                "description": ""}
    if not LLM_API_URL or not attrs:
        return fallback
    prompt = ("Write a short title and a 2-3 sentence honest description for a student marketplace listing. "
              f"Item details: {attrs}. Reply JSON only: {{\"title\":\"\",\"description\":\"\"}}")
    base_url = LLM_API_URL.rstrip('/')
    url = f"{base_url}/chat/completions" if base_url.endswith("/v1") else f"{base_url}/v1/chat/completions"
    headers = {"Authorization": f"Bearer {LLM_API_KEY}"} if LLM_API_KEY else {}
    r = httpx.post(url,
                   json={"model": LLM_MODEL, "messages": [{"role": "user", "content": prompt}]}, 
                   headers=headers, timeout=60)
    r.raise_for_status()
    import json
    t = r.json()["choices"][0]["message"]["content"]
    try:
        return json.loads(t[t.index("{"): t.rindex("}") + 1])
    except ValueError:
        return fallback
