from __future__ import annotations

from app.schemas.lead import (
    LeadCreate,
    LeadRead,
    LeadSource,
    LeadStatus,
    PermissionState,
)

SEED_ROWS: tuple[
    tuple[str, str, LeadSource, PermissionState, LeadStatus, str], ...
] = (
    ("LD-1041", "Asha Patel", "Website enquiry", "verified", "warm_lead", "Today, 09:20"),
    ("LD-1040", "Rohit Shah", "CSV import", "verified", "interested", "Today, 08:45"),
    ("LD-1039", "Meera Joshi", "Manual entry", "review", "new", "Yesterday, 17:10"),
    ("LD-1038", "Karan Mehta", "Website enquiry", "excluded", "do_not_contact", "Yesterday, 15:35"),
    ("LD-1037", "Nisha Rao", "CSV import", "verified", "contacted", "Yesterday, 11:05"),
    ("LD-1036", "Aditya Desai", "Website enquiry", "verified", "interested", "Yesterday, 10:40"),
    ("LD-1035", "Priya Nair", "Manual entry", "review", "new", "Yesterday, 09:15"),
    ("LD-1034", "Vijay Kumar", "CSV import", "verified", "contacted", "Monday, 18:30"),
    ("LD-1033", "Sneha Iyer", "Website enquiry", "excluded", "do_not_contact", "Monday, 16:05"),
    ("LD-1032", "Rahul Verma", "CSV import", "verified", "warm_lead", "Monday, 14:20"),
    ("LD-1031", "Anjali Sharma", "Website enquiry", "verified", "interested", "Monday, 11:50"),
    ("LD-1030", "Deepak Joshi", "Manual entry", "review", "new", "Monday, 09:10"),
    ("LD-1029", "Kavita Rana", "CSV import", "verified", "contacted", "Friday, 17:45"),
    ("LD-1028", "Nikhil Bhatt", "Website enquiry", "excluded", "do_not_contact", "Friday, 15:30"),
    ("LD-1027", "Pooja Menon", "Manual entry", "verified", "warm_lead", "Friday, 12:05"),
    ("LD-1026", "Sanjay Gupta", "CSV import", "review", "new", "Friday, 10:20"),
    ("LD-1025", "Rina Kapoor", "Website enquiry", "verified", "contacted", "Thursday, 18:10"),
    ("LD-1024", "Manish Chauhan", "CSV import", "excluded", "do_not_contact", "Thursday, 16:40"),
    ("LD-1023", "Tara Sheth", "Manual entry", "verified", "warm_lead", "Thursday, 13:25"),
    ("LD-1022", "Omkar Patil", "Website enquiry", "review", "new", "Thursday, 10:05"),
)


class DuplicateLeadError(ValueError):
    pass


_leads: list[LeadRead] = []


def reset_leads() -> None:
    global _leads
    _leads = [
        LeadRead(
            id=lead_id,
            full_name=full_name,
            phone=f"900000{1000 + index}",
            source=source,
            permission=permission,
            lead_status=lead_status,
            updated_label=updated_label,
        )
        for index, (lead_id, full_name, source, permission, lead_status, updated_label) in enumerate(
            SEED_ROWS
        )
    ]


reset_leads()


def list_leads() -> list[LeadRead]:
    return [lead.model_copy(deep=True) for lead in _leads]


def find_by_phone(phone: str) -> LeadRead | None:
    return next((lead for lead in _leads if lead.phone == phone), None)


def add_lead(payload: LeadCreate) -> LeadRead:
    if find_by_phone(payload.phone) is not None:
        raise DuplicateLeadError(payload.phone)

    next_number = max(int(lead.id.removeprefix("LD-")) for lead in _leads) + 1
    lead = LeadRead(
        id=f"LD-{next_number}",
        full_name=payload.full_name,
        phone=payload.phone,
        source=payload.source,
        permission="review",
        lead_status="new",
        updated_label="Just now",
    )
    _leads.insert(0, lead)
    return lead.model_copy(deep=True)
