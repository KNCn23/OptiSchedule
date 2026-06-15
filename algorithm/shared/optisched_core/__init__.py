"""OptiSchedule shared core — single source of truth for the scheduling
algorithm, validator, room allocation, post-processing and exports.

Both the FastAPI backend (`scheduler/` shim package) and the standalone CLI
(`optisched/` shim package) re-export from here so fixes live in one place.
"""

from .config import SchedulerConfig
from .solver import OptiSchedSolver, _splits_for
from .postprocess import compress_schedule_blocks
from .room_allocator import RoomAllocator
from .validator import (
    Violation,
    ValidationReport,
    validate_schedule,
    validate_rooms,
    validate_global_instructor,
    format_report,
)
from .matrix_export import (
    Placement,
    placements_from_schedule_df,
    placements_from_courses,
    build_workbook,
    export_matrix_xlsx,
    matrix_bytes,
    EMPTY_CELL,
    DAY_ABBR,
    DAY_FULL,
)

__all__ = [
    "SchedulerConfig",
    "OptiSchedSolver",
    "_splits_for",
    "compress_schedule_blocks",
    "RoomAllocator",
    "Violation",
    "ValidationReport",
    "validate_schedule",
    "validate_rooms",
    "validate_global_instructor",
    "format_report",
    "Placement",
    "placements_from_schedule_df",
    "placements_from_courses",
    "build_workbook",
    "export_matrix_xlsx",
    "matrix_bytes",
    "EMPTY_CELL",
    "DAY_ABBR",
    "DAY_FULL",
]
