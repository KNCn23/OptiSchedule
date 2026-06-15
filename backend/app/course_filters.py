from __future__ import annotations

import re
import unicodedata
from typing import Any


def _normalize_course_name(value: object) -> str:
    text = unicodedata.normalize("NFKD", str(value or ""))
    text = "".join(char for char in text if not unicodedata.combining(char))
    return re.sub(r"\s+", " ", text.replace("ı", "i").casefold()).strip()


def is_graduation_project(value: object) -> bool:
    name = _normalize_course_name(value)
    return bool(re.match(
        r"^(?:bitirme projesi|graduation project)\s+(?:1|2|i|ii)(?:\b|[-(])",
        name,
    ))


def without_graduation_projects(courses: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [
        course
        for course in courses
        if not is_graduation_project(course.get("name"))
    ]
