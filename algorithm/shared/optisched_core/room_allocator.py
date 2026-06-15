from __future__ import annotations

import pandas as pd


class RoomAllocator:
    def __init__(self, classrooms_df: pd.DataFrame):
        self.classrooms_df = classrooms_df
        self.occupied_rooms: dict[tuple, set] = {}

    def allocate(self, schedule_df: pd.DataFrame) -> pd.DataFrame:
        if schedule_df.empty or self.classrooms_df.empty:
            schedule_df["Sinif"] = "Belirsiz"
            return schedule_df

        sorted_rooms = self.classrooms_df.sort_values(by="lecture_capacity", ascending=True)
        assigned_classes = []

        for _, row in schedule_df.iterrows():
            if row.get("is_service", False):
                assigned_classes.append("Derslik Yok")
                continue

            slot_indices = row.get("slot_indices")
            if isinstance(slot_indices, list) and slot_indices:
                slots = [int(slot) for slot in slot_indices]
            else:
                s_idx = row.get("s_idx")
                slots = [int(s_idx)] if pd.notna(s_idx) else []

            time_keys = [(row.get("d_idx"), slot) for slot in slots]
            for time_key in time_keys:
                if time_key not in self.occupied_rooms:
                    self.occupied_rooms[time_key] = set()

            expected = row.get("expected_student", 0)
            if pd.isna(expected) or expected <= 0:
                expected = 1

            assigned_room = None
            for _, room in sorted_rooms.iterrows():
                room_id = room["classroom_id"]
                if any(room_id in self.occupied_rooms[time_key] for time_key in time_keys):
                    continue
                cap = room["lecture_capacity"]
                if pd.isna(cap):
                    cap = 0
                if cap >= expected:
                    assigned_room = room
                    break

            if assigned_room is None:
                for _, room in sorted_rooms.sort_values(by="lecture_capacity", ascending=False).iterrows():
                    room_id = room["classroom_id"]
                    if all(room_id not in self.occupied_rooms[time_key] for time_key in time_keys):
                        assigned_room = room
                        break

            if assigned_room is not None:
                assigned_classes.append(assigned_room["classroom_name"])
                for time_key in time_keys:
                    self.occupied_rooms[time_key].add(assigned_room["classroom_id"])
            else:
                assigned_classes.append("Sinif Yok")

        schedule_df["Sinif"] = assigned_classes
        return schedule_df
