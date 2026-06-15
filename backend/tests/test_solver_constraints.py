from __future__ import annotations

import unittest

import pandas as pd

from algorithm.shared.optisched_core import (
    OptiSchedSolver,
    SchedulerConfig,
    validate_global_instructor,
    validate_schedule,
)


def course_row(code: str, instructor: str = "Instructor A") -> dict:
    return {
        "parent_id": code,
        "base_code": code,
        "name": code,
        "code": f"{code}-1",
        "hours": 1,
        "semester": 1,
        "section": 1,
        "total_sections": 1,
        "instructor": instructor,
        "department_name": "BİL",
        "course_type_id": 1,
        "expected_student": 30,
        "is_service": False,
        "is_online": False,
        "split_index": 0,
    }


class SolverConstraintTests(unittest.TestCase):
    def config(self) -> SchedulerConfig:
        return SchedulerConfig(
            days=[0, 1],
            timeslots=[0, 1, 2],
            online_timeslots=[],
            time_map={
                0: "09:00-10:00",
                1: "10:00-11:00",
                2: "11:00-12:00",
            },
            max_solve_time_seconds=5,
            random_seed=1,
            weight_adjacent_overlap=0,
            weight_lunch=0,
            weight_instructor_balance=0,
        )

    def test_instructor_unavailable_is_enforced(self):
        frame = pd.DataFrame([course_row("BİL101")])
        solver = OptiSchedSolver(
            frame,
            self.config(),
            time_constraints=[{
                "type": "instructor_unavailable",
                "target": "Instructor A",
                "day": 0,
                "slot": 0,
            }],
        )
        solver.build_model()
        solver.solve()
        self.assertNotIn((0, 0), solver.get_index_assignments()[0])

    def test_course_fixed_is_enforced(self):
        frame = pd.DataFrame([course_row("BİL101")])
        solver = OptiSchedSolver(
            frame,
            self.config(),
            time_constraints=[{
                "type": "course_fixed",
                "target": "BİL101",
                "day": 1,
                "slot": 2,
            }],
        )
        solver.build_model()
        solver.solve()
        self.assertEqual([(1, 2)], solver.get_index_assignments()[0])

    def test_linked_courses_start_together(self):
        frame = pd.DataFrame([
            course_row("BİL101", "Instructor A"),
            course_row("CSE101", "Instructor A"),
        ])
        solver = OptiSchedSolver(
            frame,
            self.config(),
            linked_groups=[["BİL101", "CSE101"]],
        )
        solver.build_model()
        solver.solve()
        self.assertEqual(
            solver.get_index_assignments()[0],
            solver.get_index_assignments()[1],
        )
        report = validate_schedule(
            frame,
            solver.get_index_assignments(),
            linked_groups=[["BİL101", "CSE101"]],
        )
        self.assertFalse(report.errors)

    def test_linked_courses_match_exact_section_and_split(self):
        rows = []
        fixed_assignments = {}
        expected_slots = {
            (1, 0): [(0, 0)],
            (1, 1): [(1, 0)],
            (2, 0): [(0, 1)],
            (2, 1): [(1, 1)],
        }
        for code, instructor in (("BİL101", "Instructor A"), ("CSE101", "Instructor B")):
            for section in (1, 2):
                for split_index in (0, 1):
                    solver_code = f"{code}-{section}#P{split_index + 1}"
                    row = course_row(code, instructor)
                    row.update({
                        "parent_id": f"{code}-{section}",
                        "code": solver_code,
                        "section": section,
                        "total_sections": 2,
                        "split_index": split_index,
                    })
                    rows.append(row)
                    if code == "BİL101":
                        fixed_assignments[solver_code] = expected_slots[(section, split_index)]

        frame = pd.DataFrame(rows)
        solver = OptiSchedSolver(
            frame,
            self.config(),
            fixed_assignments=fixed_assignments,
            linked_groups=[["BİL101", "CSE101"]],
        )
        solver.build_model()
        schedule = solver.solve()

        self.assertFalse(schedule.empty)
        assignments = solver.get_index_assignments()
        for section in (1, 2):
            for split_index in (0, 1):
                first = frame.index[
                    (frame["base_code"] == "BİL101")
                    & (frame["section"] == section)
                    & (frame["split_index"] == split_index)
                ][0]
                second = frame.index[
                    (frame["base_code"] == "CSE101")
                    & (frame["section"] == section)
                    & (frame["split_index"] == split_index)
                ][0]
                self.assertEqual(expected_slots[(section, split_index)], assignments[first])
                self.assertEqual(assignments[first], assignments[second])
                self.assertEqual(
                    solver.linked_unit_by_index[first],
                    solver.linked_unit_by_index[second],
                )

    def test_linked_courses_use_one_room_with_combined_capacity(self):
        frame = pd.DataFrame([
            {**course_row("BİL101", "Instructor A"), "expected_student": 30},
            {**course_row("CSE101", "Instructor B"), "expected_student": 30},
        ])
        too_small = OptiSchedSolver(
            frame.copy(),
            self.config(),
            linked_groups=[["BİL101", "CSE101"]],
            room_capacities=[40],
        )
        too_small.build_model()
        self.assertTrue(too_small.solve().empty)

        fitting = OptiSchedSolver(
            frame.copy(),
            self.config(),
            linked_groups=[["BİL101", "CSE101"]],
            room_capacities=[60],
        )
        fitting.build_model()
        self.assertFalse(fitting.solve().empty)

    def test_locked_common_course_blocks_student_slot(self):
        frame = pd.DataFrame([course_row("BİL201")])
        solver = OptiSchedSolver(
            frame,
            self.config(),
            student_busy={(1, 0): {(0, 0)}},
        )
        solver.build_model()
        solver.solve()
        self.assertNotIn((0, 0), solver.get_index_assignments()[0])

    def test_section_groups_start_together(self):
        rows = []
        for section in (1, 2, 3):
            row = course_row("CHEM116", f"Instructor {section}")
            row.update({
                "parent_id": f"CHEM116-{section}",
                "code": f"CHEM116-{section}",
                "section": section,
                "total_sections": 5,
                "co_schedule_group": "CHEM116:G1",
            })
            rows.append(row)
        frame = pd.DataFrame(rows)
        solver = OptiSchedSolver(frame, self.config())
        solver.build_model()
        solver.solve()

        assignments = solver.get_index_assignments()
        self.assertEqual(assignments[0], assignments[1])
        self.assertEqual(assignments[1], assignments[2])

    def test_section_group_counts_as_one_consecutive_hour_for_same_instructor(self):
        rows = []
        for section in (1, 2, 3):
            row = course_row("CHEM116", "Instructor A")
            row.update({
                "parent_id": f"CHEM116-{section}",
                "code": f"CHEM116-{section}",
                "section": section,
                "total_sections": 5,
                "co_schedule_group": "CHEM116:G1",
            })
            rows.append(row)
        frame = pd.DataFrame(rows)
        config = self.config()
        config.max_consecutive_hours = 1
        solver = OptiSchedSolver(frame, config)
        solver.build_model()
        result = solver.solve()

        self.assertFalse(result.empty)
        assignments = solver.get_index_assignments()
        self.assertEqual(assignments[0], assignments[1])
        self.assertEqual(assignments[1], assignments[2])

    def test_room_capacity_profile_spreads_large_courses(self):
        frame = pd.DataFrame([
            {
                **course_row("BIG101", "Instructor A"),
                "expected_student": 50,
            },
            {
                **course_row("BIG102", "Instructor B"),
                "expected_student": 50,
            },
        ])
        config = SchedulerConfig(
            days=[0],
            timeslots=[0, 1],
            online_timeslots=[],
            random_seed=7,
            max_solve_time_seconds=5,
            enforce_semester_clash=False,
        )
        solver = OptiSchedSolver(
            frame,
            config,
            room_capacities=[60],
        )
        solver.build_model()
        schedule = solver.solve()

        self.assertFalse(schedule.empty)
        assignments = solver.get_index_assignments()
        self.assertNotEqual(assignments[0], assignments[1])

    def test_section_group_is_not_a_global_instructor_conflict(self):
        schedule = pd.DataFrame([
            {
                "DersKodu": "CHEM116-1",
                "instructor": "Instructor A",
                "d_idx": 0,
                "s_idx": 1,
                "co_schedule_group": "CHEM116:G1",
                "split_index": 0,
            },
            {
                "DersKodu": "CHEM116-2",
                "instructor": "Instructor A",
                "d_idx": 0,
                "s_idx": 1,
                "co_schedule_group": "CHEM116:G1",
                "split_index": 0,
            },
        ])
        self.assertEqual([], validate_global_instructor(schedule))


if __name__ == "__main__":
    unittest.main()
