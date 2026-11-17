from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.leads import router as leads_router

LOCAL_WEB_ORIGINS = ("http://localhost:3000", "http://127.0.0.1:3000")

app = FastAPI(title="AI Lead Conversion API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=list(LOCAL_WEB_ORIGINS),
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)
app.include_router(leads_router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
