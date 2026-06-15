from __future__ import annotations

import unittest

import pandas as pd

from algorithm.shared.optisched_core import SchedulerConfig
from backend.app.models import AlgorithmInput, CommonWorkbookRow, UniversitySchedulerRunRequest
from backend.app.scheduler_adapter import (
    _common_rows_frame,
    _departments_for_request,
    _normalize_overloaded_mandatory,
    _source_frame,
)


class SchedulerAdapterTests(unittest.TestCase):
    def test_graduation_projects_are_excluded_from_workbook_rows(self):
        source = pd.DataFrame([
            {
                "Ders Kodu": "BİL490",
                "Ders Adı": "BİTİRME PROJESİ II",
                "Şube": 1,
                "Kredi": 2,
            },
            {
                "Ders Kodu": "BİL401",
                "Ders Adı": "YAZILIM MÜHENDİSLİĞİ",
                "Şube": 1,
                "Kredi": 3,
            },
        ])

        frame = _source_frame(source, "BİL", {}, "spring")

        self.assertEqual({"BİL401"}, set(frame["base_code"]))

    def test_uploaded_common_rows_are_used_as_solver_input(self):
        frame = _common_rows_frame(
            [
                CommonWorkbookRow(
                    course_code="MAT152",
                    course_name="Matematik II",
                    section=2,
                    credit=3,
                    t_hour=2,
                    l_hour=1,
                    capacity=40,
                    enrolled=37,
                    instructor="Instructor A",
                )
            ],
            {},
            "spring",
        )

        self.assertEqual(set(frame["hours"]), {3})
        self.assertEqual(3, int(frame["hours"].sum()))
        self.assertEqual(set(frame["section"]), {2})
        self.assertEqual(set(frame["expected_student"]), {37})
        self.assertEqual(set(frame["department_name"]), {"HAVUZ"})

    def test_department_workbook_only_keeps_selected_course_codes(self):
        source = pd.DataFrame([
            {
                "Ders Kodu": "BİL122",
                "Ders Adı": "İLERİ PROGRAMLAMA",
                "Şube": 1,
                "Kredi": 3,
                "Öğretim Görevlisi": "Instructor A",
            },
            {
                "Ders Kodu": "BİL210",
                "Ders Adı": "ELEKTRONİĞE GİRİŞ",
                "Şube": 1,
                "Kredi": 3,
                "Öğretim Görevlisi": "Instructor B",
            },
        ])

        frame = _source_frame(
            source,
            "BİL",
            {},
            "spring",
            {"BİL122"},
        )

        self.assertEqual({"BİL122"}, set(frame["base_code"]))

    def test_workbook_split_uses_theory_plus_lab_total_and_preference(self):
        source = pd.DataFrame([{
            "Ders Kodu": "BİL122",
            "Ders Adı": "İLERİ PROGRAMLAMA",
            "Şube": 1,
            "Kredi": 3,
            "t_hour": 3,
            "l_hour": 0,
            "Öğretim Görevlisi": "Instructor A",
        }])

        frame = _source_frame(
            source,
            "BİL",
            {},
            "spring",
            split_patterns={"BİL122": ["2+1"]},
        )

        self.assertEqual([2, 1], frame.sort_values("split_index")["hours"].tolist())
        self.assertEqual(3, int(frame["hours"].sum()))

    def test_workbook_total_prefers_theory_plus_lab_over_credit(self):
        source = pd.DataFrame([{
            "Ders Kodu": "BİL122",
            "Ders Adı": "İLERİ PROGRAMLAMA",
            "Şube": 1,
            "Kredi": 2,
            "t_hour": 2,
            "l_hour": 1,
            "Öğretim Görevlisi": "Instructor A",
        }])

        frame = _source_frame(source, "BİL", {}, "spring")

        self.assertEqual(3, int(frame["hours"].sum()))

    def test_lab_sections_are_split_into_two_synchronized_groups(self):
        source = pd.DataFrame([
            {
                "Ders Kodu": "CHEM116",
                "Ders Adı": "GENEL KİMYA LABORATUVARI",
                "Şube": section,
                "Kredi": 2,
                "Öğretim Görevlisi": f"Instructor {section}",
            }
            for section in range(1, 8)
        ])

        frame = _source_frame(source, "HAVUZ", {}, "spring")
        groups = {
            section: set(frame.loc[frame["section"] == section, "co_schedule_group"])
            for section in range(1, 8)
        }

        for section in (1, 2, 3, 4):
            self.assertEqual({"CHEM116:G1"}, groups[section])
        for section in (5, 6, 7):
            self.assertEqual({"CHEM116:G2"}, groups[section])

    def test_overloaded_upper_year_courses_are_relaxed(self):
        rows = []
        for number in range(10):
            code = f"MAK{340 + number}"
            rows.append({
                "base_code": code,
                "hours": 4,
                "semester": 6,
                "section": 1,
                "total_sections": 1,
                "course_type_id": 1,
                "capacity": 20,
            })

        config = SchedulerConfig(
            days=[0, 1, 2, 3, 4],
            timeslots=list(range(8)),
            online_timeslots=[],
        )
        normalized = _normalize_overloaded_mandatory(
            pd.DataFrame(rows),
            config,
        )

        mandatory_hours = int(
            normalized.loc[
                normalized["course_type_id"] == 1,
                "hours",
            ].sum()
        )
        self.assertLess(mandatory_hours, 40)
        self.assertGreater(
            int((normalized["course_type_id"] == 2).sum()),
            0,
        )

    def test_university_run_targets_only_selected_department(self):
        request = UniversitySchedulerRunRequest(
            term="spring",
            view_department="BİL",
            selection_department="BİL",
        )
        self.assertEqual(["BİL"], _departments_for_request(request))

    def test_common_only_run_does_not_generate_departments(self):
        request = UniversitySchedulerRunRequest(
            term="spring",
            view_department="HAVUZ",
            selection_department="HAVUZ",
            common_only=True,
        )
        self.assertEqual([], _departments_for_request(request))


if __name__ == "__main__":
    unittest.main()
