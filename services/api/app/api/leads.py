from __future__ import annotations

from fastapi import APIRouter, HTTPException, status

from app.schemas.lead import LeadCreate, LeadListResponse, LeadRead
from app.services import lead_store

router = APIRouter(prefix="/leads", tags=["leads"])


@router.get("", response_model=LeadListResponse)
def get_leads() -> LeadListResponse:
    items = lead_store.list_leads()
    return LeadListResponse(items=items, total=len(items))


@router.post("", response_model=LeadRead, status_code=status.HTTP_201_CREATED)
def create_lead(payload: LeadCreate) -> LeadRead:
    try:
        return lead_store.add_lead(payload)
    except lead_store.DuplicateLeadError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A lead with this phone number already exists",
        ) from exc
