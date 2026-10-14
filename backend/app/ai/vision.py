"""Step 7a: image -> structured attributes (Qwen3-VL).
Serve Qwen3-VL behind an OpenAI-compatible endpoint (vLLM / hosted) and set VISION_API_URL.
Without it, returns empty suggestions so manual listing still works."""
import base64, json, os
import httpx

_openai_key = os.getenv("OPENAI_API_KEY", "")
_openrouter_key = os.getenv("OPENROUTER_API_KEY", "")
_groq_key = os.getenv("GROQ_API_KEY", "")

VISION_API_KEY = (
    os.getenv("VISION_API_KEY")
    or _openrouter_key
    or _groq_key
    or _openai_key
)

if not os.getenv("VISION_API_URL"):
    if _openrouter_key:
        VISION_API_URL = "https://openrouter.ai/api/v1"
    elif _groq_key:
        VISION_API_URL = "https://api.groq.com/openai/v1"
    elif _openai_key:
        VISION_API_URL = "https://api.openai.com/v1"
    else:
        VISION_API_URL = ""
else:
    VISION_API_URL = os.getenv("VISION_API_URL", "")

if not os.getenv("VISION_MODEL"):
    if "openrouter" in VISION_API_URL:
        VISION_MODEL = "qwen/qwen-2.5-vl-72b-instruct"
    elif "groq" in VISION_API_URL:
        VISION_MODEL = "llama-3.2-11b-vision-preview"
    elif "openai" in VISION_API_URL:
        VISION_MODEL = "gpt-4o-mini"
    else:
        VISION_MODEL = "Qwen/Qwen3-VL-8B-Instruct"
else:
    VISION_MODEL = os.getenv("VISION_MODEL", "")

PROMPT = ("Identify this second-hand item. Reply with JSON only: "
          '{"product_type":"","brand":"","model":"","category":"","condition":"new|good|fair|poor","features":[]}')

def analyze_image(image_bytes: bytes) -> dict:
    if not VISION_API_URL:
        return {}
    b64 = base64.b64encode(image_bytes).decode()
    body = {"model": VISION_MODEL, "messages": [{"role": "user", "content": [
        {"type": "text", "text": PROMPT},
        {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{b64}"}}]}]}
    base_url = VISION_API_URL.rstrip('/')
    url = f"{base_url}/chat/completions" if base_url.endswith("/v1") else f"{base_url}/v1/chat/completions"
    headers = {"Authorization": f"Bearer {VISION_API_KEY}"} if VISION_API_KEY else {}
    r = httpx.post(url, json=body, headers=headers, timeout=60)
    r.raise_for_status()
    text = r.json()["choices"][0]["message"]["content"]
    try:
        return json.loads(text[text.index("{"): text.rindex("}") + 1])
    except ValueError:
        return {}
