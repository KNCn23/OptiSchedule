from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class SchedulerConfig:
    days: list[int] = field(default_factory=lambda: list(range(5)))
    day_map: dict[int, str] = field(default_factory=lambda: {
        0: "Pazartesi", 1: "Salı", 2: "Çarşamba", 3: "Perşembe", 4: "Cuma"
    })
    timeslots: list[int] = field(default_factory=lambda: list(range(8)))
    time_map: dict[int, str] = field(default_factory=lambda: {
        0: "09:00-10:00", 1: "10:00-11:00", 2: "11:00-12:00", 3: "12:00-13:00",
        4: "13:00-14:00", 5: "14:00-15:00", 6: "15:00-16:00", 7: "16:00-17:00",
    })
    max_solve_time_seconds: float = 60.0
    # When None, a random seed is used on every solve (varied timetables).
    # Set an int for reproducible output (used by the self-test suite).
    random_seed: int | None = None

    # Evening slot indices for online courses (18:00-22:00). Used by the
    # online/evening scheduling phase; face-to-face courses never use these.
    online_timeslots: list[int] = field(default_factory=lambda: [8, 9, 10, 11])
    online_time_map: dict[int, str] = field(default_factory=lambda: {
        8: "18:00-19:00", 9: "19:00-20:00", 10: "20:00-21:00", 11: "21:00-22:00",
    })

    # Slots reserved as a preferred lunch break (12:00-13:00 -> slot 3).
    # Scheduling a course here is allowed but penalised (soft).
    lunch_slots: list[int] = field(default_factory=lambda: [3])
    enforce_lunch_break: bool = False

    # --- Soft-objective weights (higher = stronger preference) -------------
    # Adjacent-semester (sem / sem+2) mandatory overlap.
    weight_adjacent_overlap: int = 8
    # Idle gaps inside a (semester, section)'s day between its courses.
    # Off by default: gap modelling adds many booleans and can make a heavy
    # department time out (return infeasible) under a tight solve budget.
    # Enable (e.g. 3) when the per-department time budget is generous.
    weight_student_gap: int = 0
    # Courses placed on a reserved lunch slot.
    weight_lunch: int = 2
    # Imbalance in an instructor's per-day teaching load.
    weight_instructor_balance: int = 1
    max_consecutive_hours: int = 5

    # Hard-rule switches loaded from scheduler_system_rules.
    enforce_instructor_clash: bool = True
    enforce_semester_clash: bool = True
    enforce_consecutive_limit: bool = True
    enforce_weekly_hours: bool = True

    DAY_KEY_MAP: dict[int, str] = field(default_factory=lambda: {
        0: "Mon", 1: "Tue", 2: "Wed", 3: "Thu", 4: "Fri"
    })

    def evening_config(self) -> "SchedulerConfig":
        """A config whose timeslots are the evening slots, for online courses.

        Reuses the same days but swaps the daytime slot grid for the evening
        one so online courses are placed at 18:00-22:00. Lunch penalty is
        disabled (irrelevant in the evening)."""
        return SchedulerConfig(
            days=list(self.days),
            day_map=dict(self.day_map),
            timeslots=list(self.online_timeslots),
            time_map=dict(self.online_time_map),
            max_solve_time_seconds=self.max_solve_time_seconds,
            random_seed=self.random_seed,
            online_timeslots=list(self.online_timeslots),
            online_time_map=dict(self.online_time_map),
            lunch_slots=[],
            enforce_lunch_break=False,
            weight_adjacent_overlap=self.weight_adjacent_overlap,
            weight_student_gap=self.weight_student_gap,
            weight_lunch=0,
            weight_instructor_balance=self.weight_instructor_balance,
            max_consecutive_hours=self.max_consecutive_hours,
            enforce_instructor_clash=self.enforce_instructor_clash,
            enforce_semester_clash=self.enforce_semester_clash,
            enforce_consecutive_limit=self.enforce_consecutive_limit,
            enforce_weekly_hours=self.enforce_weekly_hours,
            DAY_KEY_MAP=dict(self.DAY_KEY_MAP),
        )
