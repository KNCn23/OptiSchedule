from __future__ import annotations

import os
import unittest
import uuid

from backend.app.constraint_repository import (
    get_constraint_bundle,
    save_constraint_bundle,
)
from backend.app.models import LinkedCourseGroup, TimeConstraint


@unittest.skipUnless(os.getenv("RUN_DB_TESTS") == "1", "database integration test")
class ConstraintRepositoryTests(unittest.TestCase):
    def test_round_trip(self):
        suffix = uuid.uuid4().hex[:8]
        period = f"2098-2099|fall"
        department = f"T{suffix}"
        bundle = get_constraint_bundle(period, department)
        bundle.systemRules["semesterClash"] = False
        bundle.constraints = [
            TimeConstraint(
                type="course_blocked",
                target="BİL101",
                day="Mon",
                hour=9,
            )
        ]
        bundle.splits = {"BİL101": ["2+2", "4+0"]}
        bundle.linkedGroups = [
            LinkedCourseGroup(
                id=str(uuid.uuid4()),
                courseCodes=["BİL101", "CSE101"],
            )
        ]
        saved = save_constraint_bundle(bundle)
        self.assertFalse(saved.systemRules["semesterClash"])
        self.assertEqual("course_blocked", saved.constraints[0].type)
        self.assertEqual(["2+2", "4+0"], saved.splits["BİL101"])
        self.assertEqual(
            {"BİL101", "CSE101"},
            set(saved.linkedGroups[0].courseCodes),
        )
