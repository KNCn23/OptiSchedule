from __future__ import annotations

import random

import pandas as pd
from ortools.sat.python import cp_model

from .config import SchedulerConfig


def _splits_for(total_hours: int) -> list[int]:
    if total_hours == 5:
        return [3, 2]
    elif total_hours == 4:
        return [2, 2]
    elif total_hours == 6:
        return [3, 3]
    return [total_hours]


class OptiSchedSolver:
    def __init__(
        self,
        df: pd.DataFrame,
        config: SchedulerConfig,
        fixed_assignments: dict[str, list[tuple]] | None = None,
        instructor_busy: dict[str, set[tuple]] | None = None,
        student_busy: dict[tuple[int, int], set[tuple]] | None = None,
        time_constraints: list[dict] | None = None,
        linked_groups: list[list[str]] | None = None,
        room_capacities: list[int] | None = None,
        room_busy_requirements: dict[tuple[int, int], list[int]] | None = None,
    ):
        self.df = df
        self.config = config
        self.fixed_assignments = fixed_assignments or {}
        # instructor name -> set of (day, slot) the instructor is already
        # teaching in *other* departments. Used to prevent cross-department
        # lecturer clashes when departments are solved sequentially.
        self.instructor_busy = instructor_busy or {}
        self.student_busy = student_busy or {}
        self.time_constraints = time_constraints or []
        self.linked_groups = linked_groups or []
        self.room_capacities = sorted(
            int(value) for value in (room_capacities or []) if int(value) > 0
        )
        self.room_busy_requirements = room_busy_requirements or {}
        self.linked_group_by_code = {
            code: group_index
            for group_index, group in enumerate(self.linked_groups)
            for code in group
        }
        self.linked_unit_by_index: dict[int, str] = {}
        self.model = cp_model.CpModel()
        self.assignments: dict = {}
        self.start_vars: dict = {}
        self.overlap_vars: list = []
        self.result_data: list[dict] = []
        self.raw_assignments: dict[str, list[tuple]] = {}
        # df-row index -> list of (day, slot) the solver assigned to it.
        # Used by scheduler.validator for independent constraint checking.
        self.index_assignments: dict[int, list[tuple]] = {}
        self.status: int | None = None

    def build_model(self) -> None:
        days_range = self.config.days
        slots_range = self.config.timeslots
        max_slots = len(slots_range)

        for idx, row in self.df.iterrows():
            H = int(row["hours"])
            allowed_slots = self._allowed_slots(row)
            for d in days_range:
                for s in slots_range:
                    self.assignments[(idx, d, s)] = self.model.NewBoolVar(f"c{idx}_d{d}_s{s}")
                    if all((s + k) in allowed_slots for k in range(H)):
                        self.start_vars[(idx, d, s)] = self.model.NewBoolVar(f"start_c{idx}_d{d}_s{s}")
                    if s not in allowed_slots:
                        self.model.Add(self.assignments[(idx, d, s)] == 0)

            if self.config.enforce_lunch_break and not bool(row.get("is_online", False)):
                for d in days_range:
                    for s in self.config.lunch_slots:
                        if (idx, d, s) in self.assignments:
                            self.model.Add(self.assignments[(idx, d, s)] == 0)

            course_code = row["code"]
            is_pinned = course_code in self.fixed_assignments
            if is_pinned:
                fixed_slots = self.fixed_assignments[course_code]
                for d in days_range:
                    for s in slots_range:
                        if (d, s) in fixed_slots:
                            self.model.Add(self.assignments[(idx, d, s)] == 1)
                        else:
                            self.model.Add(self.assignments[(idx, d, s)] == 0)

            self._apply_time_constraints(idx, row)

            # Block slots where this course's instructor is already busy in
            # another department (skip pinned courses — they are fully fixed
            # and consistent across departments by construction).
            if not is_pinned and self.instructor_busy:
                instructor = str(row.get("instructor", "-")).strip()
                busy = self.instructor_busy.get(instructor)
                if busy and instructor.lower() not in ("-", "anonim", ""):
                    for (d, s) in busy:
                        if (idx, d, s) in self.assignments:
                            self.model.Add(self.assignments[(idx, d, s)] == 0)

            semester = int(row.get("semester", 0))
            section = int(row.get("section", 1))
            for busy_key in ((semester, section), (semester, 0)):
                for d, s in self.student_busy.get(busy_key, set()):
                    if (idx, d, s) in self.assignments:
                        self.model.Add(self.assignments[(idx, d, s)] == 0)

        for idx, row in self.df.iterrows():
            H = int(row["hours"])
            valid_starts = []
            total_assigned = sum(
                self.assignments[(idx, d, s)]
                for d in days_range
                for s in slots_range
            )
            if self.config.enforce_weekly_hours:
                self.model.Add(total_assigned == H)
            else:
                self.model.Add(total_assigned <= H)
            for d in days_range:
                for s in slots_range:
                    if (idx, d, s) in self.start_vars:
                        s_var = self.start_vars[(idx, d, s)]
                        valid_starts.append(s_var)
                        for k in range(H):
                            self.model.AddImplication(s_var, self.assignments[(idx, d, s + k)])
            if self.config.enforce_weekly_hours:
                self.model.AddExactlyOne(valid_starts)
            else:
                self.model.AddAtMostOne(valid_starts)

        for parent_id in self.df["parent_id"].unique():
            group = self.df[self.df["parent_id"] == parent_id]
            if len(group) > 1:
                indices = group.index.tolist()
                for d in days_range:
                    day_active_vars = []
                    for idx in indices:
                        day_active = self.model.NewBoolVar(f"course_{parent_id}_part_{idx}_day_{d}")
                        self.model.Add(
                            sum(self.assignments[(idx, d, s)] for s in slots_range) > 0
                        ).OnlyEnforceIf(day_active)
                        self.model.Add(
                            sum(self.assignments[(idx, d, s)] for s in slots_range) == 0
                        ).OnlyEnforceIf(day_active.Not())
                        day_active_vars.append(day_active)
                    self.model.Add(sum(day_active_vars) <= 1)

        # Register synchronized teaching units before resource-conflict rules
        # are built so linked rows count as one instructor/room occupancy.
        self._add_linked_course_constraints(days_range, slots_range)
        self._add_section_group_constraints(days_range, slots_range)

        if self.config.enforce_instructor_clash:
            for instructor in self.df["instructor"].unique():
                if pd.isna(instructor) or str(instructor).strip().lower() in ("-", "anonim", ""):
                    continue
                inst_group = self.df[self.df["instructor"] == instructor]
                for d in days_range:
                    for s in slots_range:
                        self.model.Add(
                            sum(self._grouped_occupancy(
                                inst_group.index.tolist(),
                                d,
                                s,
                                f"instructor_{instructor}",
                            )) <= 1
                        )

        if self.config.enforce_consecutive_limit:
            self._add_consecutive_hour_limits(days_range, slots_range)

        self._add_room_capacity_constraints(days_range, slots_range)

        max_sec = int(self.df["section"].max()) if not self.df.empty else 1
        # Pre-compute index groups once (independent of day/slot) to avoid
        # re-filtering the DataFrame inside the day*slot*sem*sec loop.
        is_mandatory = self.df["course_type_id"] == 1
        mandatory_by_sem_sec: dict[tuple[int, int], list[int]] = {}
        elective_by_sem_sec: dict[tuple[int, int], list[int]] = {}
        for sem in range(1, 11):
            for sec_id in range(1, max_sec + 1):
                # A single-section mandatory course (total_sections <= 1) is
                # attended by every section of the semester, so it must be
                # protected against ALL sections — include it in each group.
                mand_mask = (
                    (self.df["semester"] == sem)
                    & is_mandatory
                    & ((self.df["section"] == sec_id) | (self.df["total_sections"] <= 1))
                )
                mandatory_by_sem_sec[(sem, sec_id)] = self.df.index[mand_mask].tolist()
                elec_mask = (
                    (self.df["semester"] == sem)
                    & (~is_mandatory)
                    & (
                        (self.df["section"] == sec_id)
                        | (self.df["total_sections"] <= 1)
                    )
                )
                elective_by_sem_sec[(sem, sec_id)] = self.df.index[elec_mask].tolist()

        for d in days_range:
            for s in slots_range:
                for sem in range(1, 9):
                    for sec_id in range(1, max_sec + 1):
                        mandatory_same = mandatory_by_sem_sec.get((sem, sec_id), [])
                        electives_same = elective_by_sem_sec.get((sem, sec_id), [])
                        mandatory_next = mandatory_by_sem_sec.get((sem + 2, sec_id), [])

                        if self.config.enforce_semester_clash and mandatory_same:
                            self.model.Add(
                                sum(self._grouped_occupancy(
                                    mandatory_same,
                                    d,
                                    s,
                                    f"mandatory_sem{sem}_sec{sec_id}",
                                )) <= 1
                            )

                        for e_idx in electives_same if self.config.enforce_semester_clash else []:
                            elective_unit = self.linked_unit_by_index.get(e_idx)
                            linked_to_mandatory = elective_unit is not None and any(
                                self.linked_unit_by_index.get(mandatory_idx)
                                == elective_unit
                                for mandatory_idx in mandatory_same
                            )
                            if linked_to_mandatory:
                                continue
                            self.model.Add(
                                sum(self._grouped_occupancy(
                                    mandatory_same,
                                    d,
                                    s,
                                    f"elective_sem{sem}_sec{sec_id}_e{e_idx}",
                                ))
                                + self.assignments[(e_idx, d, s)]
                                <= 1
                            )

                        if mandatory_same and mandatory_next:
                            overlap_var = self.model.NewBoolVar(
                                f"overlap_sem{sem}_{sem + 2}_d{d}_s{s}_sec{sec_id}"
                            )
                            self.model.Add(
                                sum(self._grouped_occupancy(
                                    mandatory_same + mandatory_next,
                                    d,
                                    s,
                                    f"adjacent_sem{sem}_sec{sec_id}",
                                )) <= 1
                            ).OnlyEnforceIf(overlap_var.Not())
                            self.overlap_vars.append(overlap_var)

        # --- Soft objective terms (weighted) -------------------------------
        objective_terms: list = []
        cfg = self.config

        w_overlap = getattr(cfg, "weight_adjacent_overlap", 1)
        if self.overlap_vars and w_overlap:
            objective_terms.append(w_overlap * sum(self.overlap_vars))

        # Lunch-slot penalty: any course occupying a reserved lunch slot.
        lunch_slots = [s for s in getattr(cfg, "lunch_slots", []) if s in slots_range]
        w_lunch = getattr(cfg, "weight_lunch", 0)
        if lunch_slots and w_lunch:
            lunch_terms = [
                self.assignments[(idx, d, s)]
                for idx in self.df.index
                for d in days_range
                for s in lunch_slots
            ]
            if lunch_terms:
                objective_terms.append(w_lunch * sum(lunch_terms))

        # Student-gap penalty: idle slots between the first and last course of
        # a (semester, section) on a given day. Computed over mandatory groups.
        w_gap = getattr(cfg, "weight_student_gap", 0)
        if w_gap:
            gap_terms = self._build_gap_terms(mandatory_by_sem_sec, days_range, slots_range)
            if gap_terms:
                objective_terms.append(w_gap * sum(gap_terms))

        # Instructor balance: penalise stacking many hours on one day.
        w_balance = getattr(cfg, "weight_instructor_balance", 0)
        if w_balance:
            balance_terms = self._build_instructor_balance_terms(days_range, slots_range)
            if balance_terms:
                objective_terms.append(w_balance * sum(balance_terms))

        if objective_terms:
            self.model.Minimize(sum(objective_terms))

    def _allowed_slots(self, row: pd.Series) -> set[int]:
        is_online = bool(row.get("is_online", False))
        if is_online and self.config.online_timeslots:
            return set(self.config.online_timeslots)
        return set(self.config.timeslots) - set(self.config.online_timeslots)

    @staticmethod
    def _base_code(row: pd.Series) -> str:
        if row.get("base_code"):
            return str(row["base_code"])
        code = str(row.get("code", ""))
        return code.rsplit("-", 1)[0] if "-" in code else code

    def _apply_time_constraints(self, idx: int, row: pd.Series) -> None:
        base_code = self._base_code(row)
        instructor = str(row.get("instructor", "")).strip()
        for item in self.time_constraints:
            constraint_type = item.get("type")
            target = str(item.get("target", "")).strip()
            day = item.get("day")
            slot = item.get("slot")
            if day not in self.config.days or slot not in self.config.timeslots:
                continue
            applies = (
                constraint_type == "instructor_unavailable" and target == instructor
            ) or (
                constraint_type in ("course_fixed", "course_blocked")
                and target in (base_code, str(row.get("code", "")))
            )
            if not applies:
                continue
            var = self.assignments[(idx, day, slot)]
            if constraint_type == "course_fixed":
                self.model.Add(var == 1)
            else:
                self.model.Add(var == 0)

    def _add_consecutive_hour_limits(self, days_range, slots_range) -> None:
        cap = max(1, int(self.config.max_consecutive_hours))
        ordered_slots = sorted(slots_range)
        for instructor in self.df["instructor"].unique():
            if pd.isna(instructor) or str(instructor).strip().lower() in ("-", "anonim", ""):
                continue
            indices = self.df.index[self.df["instructor"] == instructor].tolist()
            for day in days_range:
                for start in range(0, max(0, len(ordered_slots) - cap)):
                    window = ordered_slots[start:start + cap + 1]
                    if any(window[i + 1] != window[i] + 1 for i in range(len(window) - 1)):
                        continue
                    self.model.Add(
                        sum(
                            occupancy
                            for slot in window
                            for occupancy in self._grouped_occupancy(
                                indices,
                                day,
                                slot,
                                f"consecutive_{instructor}_{start}",
                            )
                        ) <= cap
                    )

    def _add_linked_course_constraints(self, days_range, slots_range) -> None:
        if not self.linked_groups or self.df.empty:
            return
        base_codes = self.df.apply(self._base_code, axis=1)
        for group_number, course_codes in enumerate(self.linked_groups):
            rows_by_code: dict[str, dict[tuple[int, int], int]] = {}
            for code in course_codes:
                indices = self.df.index[base_codes == code].tolist()
                if indices:
                    rows_by_code[code] = {
                        (
                            int(self.df.loc[idx].get("section", 1)),
                            int(self.df.loc[idx].get("split_index", 0)),
                        ): idx
                        for idx in indices
                    }
            if len(rows_by_code) < 2:
                continue

            all_keys = sorted({
                key
                for keyed_rows in rows_by_code.values()
                for key in keyed_rows
            })
            for section, split_index in all_keys:
                rows = [
                    keyed_rows[(section, split_index)]
                    for keyed_rows in rows_by_code.values()
                    if (section, split_index) in keyed_rows
                ]
                if len(rows) < 2:
                    continue
                unit = f"LINKED:{group_number}:S{section}:P{split_index}"
                for idx in rows:
                    self.linked_unit_by_index[idx] = unit
                    self.df.at[idx, "linked_unit"] = unit
                reference = rows[0]
                for other in rows[1:]:
                    for day in days_range:
                        for slot in slots_range:
                            ref_var = self.start_vars.get((reference, day, slot))
                            other_var = self.start_vars.get((other, day, slot))
                            if ref_var is not None and other_var is not None:
                                self.model.Add(ref_var == other_var)
                            elif ref_var is not None:
                                self.model.Add(ref_var == 0)
                            elif other_var is not None:
                                self.model.Add(other_var == 0)

    def _add_section_group_constraints(self, days_range, slots_range) -> None:
        if "co_schedule_group" not in self.df.columns or self.df.empty:
            return
        grouped = self.df[
            self.df["co_schedule_group"].fillna("").astype(str).str.len() > 0
        ].groupby(["co_schedule_group", "split_index"], dropna=False)
        for (_, _), rows in grouped:
            indices = rows.index.tolist()
            if len(indices) < 2:
                continue
            reference = indices[0]
            for other in indices[1:]:
                for day in days_range:
                    for slot in slots_range:
                        ref_var = self.start_vars.get((reference, day, slot))
                        other_var = self.start_vars.get((other, day, slot))
                        if ref_var is not None and other_var is not None:
                            self.model.Add(ref_var == other_var)
                        elif ref_var is not None:
                            self.model.Add(ref_var == 0)
                        elif other_var is not None:
                            self.model.Add(other_var == 0)

    def _add_room_capacity_constraints(self, days_range, slots_range) -> None:
        if not self.room_capacities or self.df.empty:
            return

        demand_units: dict[tuple[str, str], list[int]] = {}
        for idx, row in self.df.iterrows():
            if bool(row.get("is_online", False)):
                continue
            linked_unit = self.linked_unit_by_index.get(idx)
            section_group = str(row.get("co_schedule_group", "") or "")
            split_index = int(row.get("split_index", 0))
            if linked_unit:
                key = ("linked", linked_unit)
            elif section_group:
                key = ("section", f"{section_group}:P{split_index}")
            else:
                key = ("row", str(idx))
            demand_units.setdefault(key, []).append(idx)

        expected = {
            key: sum(
                max(
                    0,
                    int(value),
                ) if pd.notna(value) else 0
                for value in (
                    pd.to_numeric(
                        self.df.loc[idx].get("expected_student", 0),
                        errors="coerce",
                    )
                    for idx in indices
                )
            )
            for key, indices in demand_units.items()
        }
        thresholds = [-1, *sorted(set(self.room_capacities))]
        for day in days_range:
            for slot in slots_range:
                busy = self.room_busy_requirements.get((day, slot), [])
                for threshold in thresholds:
                    room_count = sum(
                        capacity > threshold
                        for capacity in self.room_capacities
                    )
                    busy_count = sum(
                        requirement > threshold
                        for requirement in busy
                    )
                    available = room_count - busy_count
                    demanding = []
                    for key, requirement in expected.items():
                        if requirement <= threshold:
                            continue
                        indices = demand_units[key]
                        demanding.extend(self._grouped_occupancy(
                            indices,
                            day,
                            slot,
                            f"room_{key[0]}_{key[1]}_{threshold}",
                        ))
                    if not demanding:
                        continue
                    self.model.Add(sum(demanding) <= max(0, available))

    def _grouped_occupancy(self, indices, day, slot, label):
        """Return occupancy vars with linked courses collapsed to one unit."""
        grouped: dict[tuple[str, int], list[int]] = {}
        for idx in indices:
            linked_unit = self.linked_unit_by_index.get(idx)
            section_group = str(self.df.loc[idx].get("co_schedule_group", "") or "")
            split_index = int(self.df.loc[idx].get("split_index", 0))
            if linked_unit:
                key = ("linked", hash(linked_unit))
            elif section_group:
                key = ("section", hash((section_group, split_index)))
            else:
                key = ("row", int(idx))
            grouped.setdefault(key, []).append(idx)

        occupancy = []
        for group_number, ((kind, group_id), group_indices) in enumerate(grouped.items()):
            variables = [self.assignments[(idx, day, slot)] for idx in group_indices]
            if len(variables) == 1:
                occupancy.append(variables[0])
                continue
            combined = self.model.NewBoolVar(
                f"linked_occ_{label}_{day}_{slot}_{kind}{group_id}_{group_number}"
            )
            self.model.AddMaxEquality(combined, variables)
            occupancy.append(combined)
        return occupancy

    def _build_gap_terms(self, mandatory_by_sem_sec, days_range, slots_range):
        """Count idle slots between a (sem, sec)'s earliest and latest class
        each day. For each (group, day, slot): gap if slot is empty but there
        is a class before AND after it that day."""
        terms = []
        max_slot = max(slots_range)
        for (sem, sec), idxs in mandatory_by_sem_sec.items():
            if len(idxs) < 2:
                continue
            for d in days_range:
                # busy[s] = 1 if any course of the group occupies (d, s)
                busy = {}
                for s in slots_range:
                    b = self.model.NewBoolVar(f"busy_sem{sem}_sec{sec}_d{d}_s{s}")
                    occ = sum(self.assignments[(i, d, s)] for i in idxs)
                    self.model.Add(occ >= 1).OnlyEnforceIf(b)
                    self.model.Add(occ == 0).OnlyEnforceIf(b.Not())
                    busy[s] = b
                for s in slots_range:
                    if s == 0 or s == max_slot:
                        continue
                    before = [busy[k] for k in slots_range if k < s]
                    after = [busy[k] for k in slots_range if k > s]
                    if not before or not after:
                        continue
                    has_before = self.model.NewBoolVar(f"hb_sem{sem}_sec{sec}_d{d}_s{s}")
                    has_after = self.model.NewBoolVar(f"ha_sem{sem}_sec{sec}_d{d}_s{s}")
                    self.model.AddMaxEquality(has_before, before)
                    self.model.AddMaxEquality(has_after, after)
                    gap = self.model.NewBoolVar(f"gap_sem{sem}_sec{sec}_d{d}_s{s}")
                    # gap = has_before AND has_after AND NOT busy[s]
                    self.model.AddBoolAnd([has_before, has_after, busy[s].Not()]).OnlyEnforceIf(gap)
                    self.model.AddBoolOr([has_before.Not(), has_after.Not(), busy[s]]).OnlyEnforceIf(gap.Not())
                    terms.append(gap)
        return terms

    def _build_instructor_balance_terms(self, days_range, slots_range):
        """Penalise an instructor having more than a soft cap of hours on a
        single day (encourages spreading load across the week)."""
        terms = []
        soft_cap = max(2, len(slots_range) // 2)  # e.g. 4 for an 8-slot day
        for instructor in self.df["instructor"].unique():
            if pd.isna(instructor) or str(instructor).strip().lower() in ("-", "anonim", ""):
                continue
            inst_idx = self.df.index[self.df["instructor"] == instructor].tolist()
            if len(inst_idx) < 2:
                continue
            for d in days_range:
                day_hours = sum(
                    self.assignments[(i, d, s)] for i in inst_idx for s in slots_range
                )
                excess = self.model.NewIntVar(0, len(slots_range), f"excess_{abs(hash(instructor)) % 10000}_d{d}")
                self.model.Add(excess >= day_hours - soft_cap)
                terms.append(excess)
        return terms

    def solve(self) -> pd.DataFrame:
        solver = cp_model.CpSolver()
        solver.parameters.max_time_in_seconds = self.config.max_solve_time_seconds
        seed = getattr(self.config, "random_seed", None)
        solver.parameters.random_seed = seed if seed is not None else random.randint(1, 100000)

        status = solver.Solve(self.model)
        self.status = status
        self.raw_assignments = {}
        self.index_assignments = {}

        if status in (cp_model.OPTIMAL, cp_model.FEASIBLE):
            for idx, row in self.df.iterrows():
                course_code = row["code"]
                if course_code not in self.raw_assignments:
                    self.raw_assignments[course_code] = []
                self.index_assignments.setdefault(idx, [])

                for d in self.config.days:
                    for s in self.config.timeslots:
                        if solver.Value(self.assignments[(idx, d, s)]):
                            self.raw_assignments[course_code].append((d, s))
                            self.index_assignments[idx].append((d, s))
                            self.result_data.append({
                                "Gun": self.config.day_map[d],
                                "Saat": self.config.time_map[s],
                                "Donem": f"{int(row['semester'])}. Dönem",
                                "Donem_Int": int(row["semester"]),
                                "DersKodu": row["code"],
                                "DersDetay": str(row["code"]),
                                "expected_student": row.get("expected_student", 0),
                                "d_idx": d,
                                "s_idx": s,
                                "course_type_id": row.get("course_type_id", 1),
                                "is_service": row.get("is_service", False),
                                "instructor": row.get("instructor", "-"),
                                "name": row.get("name", ""),
                                "department_name": row.get("department_name", ""),
                                "section": row.get("section", 1),
                                "total_sections": row.get("total_sections", 1),
                                "semester": int(row["semester"]),
                                "audience_departments": row.get("audience_departments", ""),
                                "co_schedule_group": (
                                    self.linked_unit_by_index.get(idx)
                                    or row.get("co_schedule_group", "")
                                ),
                                "split_index": row.get("split_index", 0),
                            })

            return pd.DataFrame(self.result_data)
        return pd.DataFrame()

    def get_raw_assignments(self) -> dict[str, list[tuple]]:
        return self.raw_assignments

    def get_index_assignments(self) -> dict[int, list[tuple]]:
        """df-row index -> assigned (day, slot) pairs (for validation)."""
        return self.index_assignments
