from fastapi import FastAPI

app = FastAPI(title="AI Lead Conversion API")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
