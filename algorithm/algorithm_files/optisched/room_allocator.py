import pandas as pd
from typing import Dict, List

class RoomAllocator:
    def __init__(self, classrooms_df: pd.DataFrame):
        self.classrooms_df = classrooms_df
        # Odaya göre ayrılmış zaman dilimleri: (day_idx, slot_idx) -> set of occupied room_ids
        self.occupied_rooms: Dict[tuple, set] = {}

    def allocate(self, schedule_df: pd.DataFrame) -> pd.DataFrame:
        if schedule_df.empty or self.classrooms_df.empty:
            schedule_df['Sınıf'] = "Belirsiz"
            return schedule_df

        # Sort classrooms by capacity (ascending) so we don't waste large rooms on small classes
        # Assuming lecture_capacity is the main capacity
        sorted_rooms = self.classrooms_df.sort_values(by='lecture_capacity', ascending=True)
        
        assigned_classes = []

        for idx, row in schedule_df.iterrows():
            # is_service=True dersler programa girer ama derslik atanmaz
            if row.get('is_service', False):
                assigned_classes.append('Derslik Yok')
                continue

            d_idx = row.get('d_idx')
            s_idx = row.get('s_idx')
            time_key = (d_idx, s_idx)
            
            if time_key not in self.occupied_rooms:
                self.occupied_rooms[time_key] = set()
                
            expected_student = row.get('expected_student')
            if pd.isna(expected_student) or expected_student <= 0:
                expected_student = 1 # Fallback to minimum capacity

            # Find a room that is not occupied and has enough capacity
            assigned_room = None
            for _, room in sorted_rooms.iterrows():
                room_id = room['classroom_id']
                if room_id in self.occupied_rooms[time_key]:
                    continue
                    
                cap = room['lecture_capacity']
                if pd.isna(cap):
                    cap = 0
                    
                if cap >= expected_student:
                    assigned_room = room
                    break
                    
            # If no room fits the capacity perfectly, pick the largest available room
            if assigned_room is None:
                for _, room in sorted_rooms.sort_values(by='lecture_capacity', ascending=False).iterrows():
                    room_id = room['classroom_id']
                    if room_id not in self.occupied_rooms[time_key]:
                        assigned_room = room
                        break

            if assigned_room is not None:
                assigned_classes.append(assigned_room['classroom_name'])
                self.occupied_rooms[time_key].add(assigned_room['classroom_id'])
            else:
                assigned_classes.append("Sınıf Yok")

        schedule_df['Sınıf'] = assigned_classes
        
        # Temizle (Clean up helper columns if desired, but we can keep them or drop them)
        return schedule_df
