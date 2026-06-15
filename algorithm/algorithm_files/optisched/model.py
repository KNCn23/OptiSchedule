import random
import pandas as pd
from ortools.sat.python import cp_model
from typing import Dict, List
from .config import SchedulerConfig

class OptiSchedSolver:
    def __init__(self, df: pd.DataFrame, config: SchedulerConfig, fixed_assignments: Dict[str, List[tuple]] = None,
                 instructor_busy: Dict[str, set] = None):
        self.df = df
        self.config = config
        self.fixed_assignments = fixed_assignments or {}
        # instructor -> set of (day, slot) already used by other departments
        # (prevents cross-department lecturer clashes when solving sequentially)
        self.instructor_busy = instructor_busy or {}
        self.model = cp_model.CpModel()
        self.assignments = {}
        self.result_data = []
        self.index_assignments: Dict[int, List[tuple]] = {}

    def build_model(self) -> None:
        self.start_vars = {}
        
        days_range = self.config.days
        slots_range = self.config.timeslots
        max_slots = len(slots_range)

        # 1. Variables
        for idx, row in self.df.iterrows():
            H = int(row['hours'])
            for d in days_range:
                for s in slots_range:
                    self.assignments[(idx, d, s)] = self.model.NewBoolVar(f"c{idx}_d{d}_s{s}")
                    if s + H <= max_slots:
                        self.start_vars[(idx, d, s)] = self.model.NewBoolVar(f"start_c{idx}_d{d}_s{s}")

            # Apply fixed assignments if any
            course_code = row['code']
            is_pinned = course_code in self.fixed_assignments
            if is_pinned:
                fixed_slots = self.fixed_assignments[course_code]
                for d in days_range:
                    for s in slots_range:
                        if (d, s) in fixed_slots:
                            self.model.Add(self.assignments[(idx, d, s)] == 1)
                        else:
                            self.model.Add(self.assignments[(idx, d, s)] == 0)

            # Block slots where this course's instructor is already busy in
            # another department (skip pinned courses — already fully fixed).
            if not is_pinned and self.instructor_busy:
                instructor = str(row.get('instructor', '-')).strip()
                busy = self.instructor_busy.get(instructor)
                if busy and instructor.lower() not in ('-', 'anonim', ''):
                    for (d, s) in busy:
                        if (idx, d, s) in self.assignments:
                            self.model.Add(self.assignments[(idx, d, s)] == 0)

        # 2. Total hours AND block continuity (Same day, consecutive hours)
        for idx, row in self.df.iterrows():
            H = int(row['hours'])
            valid_starts = []
            
            # The course must be scheduled for exactly H slots in total
            self.model.Add(sum(self.assignments[(idx, d, s)] for d in days_range for s in slots_range) == H)

            for d in days_range:
                for s in slots_range:
                    if s + H <= max_slots:
                        s_var = self.start_vars[(idx, d, s)]
                        valid_starts.append(s_var)
                        for k in range(H):
                            self.model.AddImplication(s_var, self.assignments[(idx, d, s + k)])

            self.model.AddExactlyOne(valid_starts)

        # 3. Split parts must be on different days
        for parent_id in self.df['parent_id'].unique():
            group = self.df[self.df['parent_id'] == parent_id]
            if len(group) > 1:
                indices = group.index.tolist()
                for d in days_range:
                    day_active_vars = []
                    for idx in indices:
                        day_active = self.model.NewBoolVar(f"course_{parent_id}_part_{idx}_day_{d}")
                        self.model.Add(sum(self.assignments[(idx, d, s)] for s in slots_range) > 0).OnlyEnforceIf(day_active)
                        self.model.Add(sum(self.assignments[(idx, d, s)] for s in slots_range) == 0).OnlyEnforceIf(day_active.Not())
                        day_active_vars.append(day_active)
                    self.model.Add(sum(day_active_vars) <= 1)

        # 4. Global Conflicts (Instructor)
        for instructor in self.df['instructor'].unique():
            if pd.isna(instructor) or str(instructor).strip() == '-' or str(instructor).strip().lower() == 'anonim': 
                continue
            inst_group = self.df[self.df['instructor'] == instructor]
            for d in days_range:
                for s in slots_range:
                    self.model.Add(sum(self.assignments[(idx, d, s)] for idx in inst_group.index) <= 1)
        
        # 5. Semester Conflict Logic (Alt-Üst Dönem)
        self.overlap_vars = []
        max_sec = int(self.df['section'].max()) if not self.df.empty else 1

        # Index gruplarını gün/slot döngüsünden önce bir kez hesapla.
        # Tek şubeli zorunlu ders (total_sections <= 1) o dönemin TÜM şubeleri
        # tarafından alınır; bu yüzden her şube grubuna dahil edilir — aksi
        # halde başka bir zorunlu dersle çakışabilir (eski hatalı davranış).
        is_mandatory = self.df['course_type_id'] == 1
        mandatory_by: Dict[tuple, list] = {}
        elective_by: Dict[tuple, list] = {}
        for sem in range(1, 11):
            for sec_id in range(1, max_sec + 1):
                mand_mask = (
                    (self.df['semester'] == sem) & is_mandatory &
                    ((self.df['section'] == sec_id) | (self.df['total_sections'] <= 1))
                )
                mandatory_by[(sem, sec_id)] = self.df.index[mand_mask].tolist()
                elec_mask = (
                    (self.df['semester'] == sem) & (self.df['section'] == sec_id) &
                    (self.df['total_sections'] > 1) & (~is_mandatory)
                )
                elective_by[(sem, sec_id)] = self.df.index[elec_mask].tolist()

        for d in days_range:
            for s in slots_range:
                for sem in range(1, 9):
                    for sec_id in range(1, max_sec + 1):
                        mandatory_same = mandatory_by.get((sem, sec_id), [])
                        electives_same = elective_by.get((sem, sec_id), [])
                        mandatory_next = mandatory_by.get((sem + 2, sec_id), [])

                        if mandatory_same:
                            # Zorunlu dersler aynı dönem içinde çakışamaz
                            self.model.Add(sum(self.assignments[(idx, d, s)] for idx in mandatory_same) <= 1)
                            
                        for e_idx in electives_same:
                            # Seçmeli ders zorunlu ile çakışamaz (ama diğer seçmelilerle çakışabilir)
                            self.model.Add(sum(self.assignments[(idx, d, s)] for idx in mandatory_same) + self.assignments[(e_idx, d, s)] <= 1)

                        if mandatory_same and mandatory_next:
                            # Alt-üst dönem çakışması (Sadece zorunlu dersler için Soft constraint)
                            overlap_var = self.model.NewBoolVar(f"overlap_sem{sem}_{sem+2}_d{d}_s{s}_sec{sec_id}")
                            self.model.Add(sum(self.assignments[(idx, d, s)] for idx in mandatory_same + mandatory_next) <= 1).OnlyEnforceIf(overlap_var.Not())
                            self.overlap_vars.append(overlap_var)

        # Çakışmaları en aza indir (Minimize overlaps)
        if self.overlap_vars:
            self.model.Minimize(sum(self.overlap_vars))

    def solve(self) -> pd.DataFrame:
        solver = cp_model.CpSolver()
        solver.parameters.max_time_in_seconds = self.config.max_solve_time_seconds
        solver.parameters.random_seed = random.randint(1, 100000)
        
        status = solver.Solve(self.model)
        self.raw_assignments = {}
        self.index_assignments = {}

        if status in (cp_model.OPTIMAL, cp_model.FEASIBLE):
            for idx, row in self.df.iterrows():
                course_code = row['code']
                if course_code not in self.raw_assignments:
                    self.raw_assignments[course_code] = []
                self.index_assignments.setdefault(idx, [])

                for d in self.config.days:
                    for s in self.config.timeslots:
                        if solver.Value(self.assignments[(idx, d, s)]):
                            self.raw_assignments[course_code].append((d, s))
                            self.index_assignments[idx].append((d, s))
                            self.result_data.append({
                                "Gün": self.config.day_map[d], 
                                "Saat": self.config.time_map[s], 
                                "Dönem": f"{int(row['semester'])}. Dönem",
                                "Dönem_Int": int(row['semester']),
                                "DersKodu": row['code'],
                                "DersDetay": str(row['code']),
                                "expected_student": row['expected_student'],
                                "d_idx": d,
                                "s_idx": s,
                                "course_type_id": row.get('course_type_id', 1),
                                "is_service": row.get('is_service', False),
                            })
            
            return pd.DataFrame(self.result_data)
        else:
            return pd.DataFrame()

    def get_raw_assignments(self) -> Dict[str, List[tuple]]:
        return getattr(self, 'raw_assignments', {})

    def get_index_assignments(self) -> Dict[int, List[tuple]]:
        """df-row index -> assigned (day, slot) pairs (for validation)."""
        return getattr(self, 'index_assignments', {})

