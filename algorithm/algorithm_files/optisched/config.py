import json
import os
from dataclasses import dataclass, field
from typing import Dict, List

@dataclass
class SchedulerConfig:
    days: List[int] = field(default_factory=lambda: list(range(5)))
    day_map: Dict[int, str] = field(default_factory=lambda: {0: 'Pazartesi', 1: 'Salı', 2: 'Çarşamba', 3: 'Perşembe', 4: 'Cuma'})
    timeslots: List[int] = field(default_factory=lambda: list(range(8)))
    time_map: Dict[int, str] = field(default_factory=lambda: {
        0: '09:00-10:00', 1: '10:00-11:00', 2: '11:00-12:00', 3: '12:00-13:00', 
        4: '13:00-14:00', 5: '14:00-15:00', 6: '15:00-16:00', 7: '16:00-17:00'
    })
    max_solve_time_seconds: float = 60.0
    input_file: str = "data/bil 2.xlsx"
    output_dir: str = "output"
    db_config: Dict[str, str] = field(default_factory=lambda: {
        "dbname": "optisched",
        "user": "kaancanolcay",
        "password": "",
        "host": "localhost",
        "port": "5432"
    })

    @classmethod
    def load_from_json(cls, file_path: str) -> 'SchedulerConfig':
        if not os.path.exists(file_path):
            return cls()
        with open(file_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
            # Ensure integer keys for maps
            if 'day_map' in data:
                data['day_map'] = {int(k): v for k, v in data['day_map'].items()}
            if 'time_map' in data:
                data['time_map'] = {int(k): v for k, v in data['time_map'].items()}
            return cls(**data)
