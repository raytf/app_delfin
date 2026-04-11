import os
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

load_dotenv()

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health() -> dict:
    return {
        "status": "ok",
        "model_loaded": False,
        "backend": os.environ.get("LITERT_BACKEND", "CPU"),
        "model": os.environ.get("MODEL_FILE", "none"),
        "vision_tokens": os.environ.get("VISION_TOKEN_BUDGET", "280"),
    }
