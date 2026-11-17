from __future__ import annotations

import re
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

PermissionState = Literal["verified", "review", "excluded"]

LeadStatus = Literal[
    "new",
    "contact_pending",
    "contacted",
    "interested",
    "hot_lead",
    "warm_lead",
    "cold_lead",
    "follow_up_required",
    "site_visit_requested",
    "site_visit_scheduled",
    "converted",
    "not_interested",
    "do_not_contact",
]

LeadSource = Literal["Website enquiry", "CSV import", "Manual entry"]

PHONE_PATTERN = re.compile(r"[6-9]\d{9}")


def normalise_phone(value: str) -> str:
    digits = re.sub(r"\D", "", value.strip())
    if len(digits) == 12 and digits.startswith("91"):
        digits = digits[2:]
    return digits


class LeadCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    full_name: str = Field(min_length=2, max_length=80)
    phone: str = Field(max_length=40)
    source: LeadSource = "Manual entry"

    @field_validator("full_name")
    @classmethod
    def clean_full_name(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("full_name must not be blank")
        return cleaned

    @field_validator("phone")
    @classmethod
    def clean_phone(cls, value: str) -> str:
        digits = normalise_phone(value)
        if not PHONE_PATTERN.fullmatch(digits):
            raise ValueError("phone must be a 10-digit Indian mobile number starting 6-9")
        return digits


class LeadRead(BaseModel):
    id: str
    full_name: str
    phone: str
    source: LeadSource
    permission: PermissionState
    lead_status: LeadStatus
    updated_label: str
    mode: Literal["dummy"] = "dummy"


class LeadListResponse(BaseModel):
    items: list[LeadRead]
    total: int
    mode: Literal["dummy"] = "dummy"
