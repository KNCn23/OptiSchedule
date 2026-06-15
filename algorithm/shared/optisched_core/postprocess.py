"""Pure post-processing helpers for solver output (no DB dependency)."""

from __future__ import annotations

import pandas as pd

# Columns that identify a single course-part occurrence within one day. Rows
# sharing these values and consecutive ``s_idx`` are merged into one block.
BLOCK_GROUP_COLS = [
    "name",
    "DersKodu",
    "department_name",
    "semester",
    "section",
    "instructor",
    "expected_student",
    "course_type_id",
    "is_service",
    "d_idx",
]


def compress_schedule_blocks(schedule_df: pd.DataFrame) -> pd.DataFrame:
    """Merge per-hour rows of the same course/day into contiguous blocks.

    Each output row gains a ``slot_indices`` list holding all hours of that
    contiguous run; ``s_idx`` is set to the run's first slot. A 4-hour course
    split as 2+2 on two days produces two block rows.
    """
    if schedule_df.empty:
        return schedule_df

    group_cols = [c for c in BLOCK_GROUP_COLS if c in schedule_df.columns]
    compressed_rows: list[dict] = []

    for _, group in schedule_df.sort_values(group_cols + ["s_idx"]).groupby(group_cols, dropna=False):
        slot_values = sorted(int(v) for v in group["s_idx"].tolist())
        if not slot_values:
            continue
        current_run = [slot_values[0]]

        def flush_run(run_slots: list[int]) -> None:
            base_row = group.iloc[0].to_dict()
            base_row["s_idx"] = run_slots[0]
            base_row["slot_indices"] = run_slots.copy()
            compressed_rows.append(base_row)

        for slot in slot_values[1:]:
            if slot == current_run[-1] + 1:
                current_run.append(slot)
            else:
                flush_run(current_run)
                current_run = [slot]
        flush_run(current_run)

    return pd.DataFrame(compressed_rows)
