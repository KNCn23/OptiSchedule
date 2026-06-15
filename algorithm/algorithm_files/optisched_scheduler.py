import logging
import sys
import random
from dataclasses import dataclass, field
from typing import Dict, List, Any, Tuple
import pandas as pd
from ortools.sat.python import cp_model

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

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

class DataLoader:
    @staticmethod
    def load_data(excel_file: str) -> pd.DataFrame:
        df = pd.read_excel(excel_file)
        expanded = []
        for i, row in df.iterrows():
            total_hours = int(row['hour']) if pd.notna(row['hour']) else 0
            if total_hours <= 0:
                continue
                
            num_sections = int(row['seciton']) if 'seciton' in row and pd.notna(row['seciton']) else 1
            if num_sections <= 0:
                num_sections = 1
                
            splits = []
            if total_hours == 5:
                splits = [3, 2]
            elif total_hours == 4:
                splits = [2, 2]
            elif total_hours == 6:
                splits = [3, 3]
            else:
                splits = [total_hours]
                
            for sec_idx in range(1, num_sections + 1):
                for split_idx, h in enumerate(splits):
                    part_suffix = f" (P{split_idx+1})" if len(splits) > 1 else ""
                    parent_id = f"{i}_{sec_idx}"
                    
                    code_val = f"{str(row['code'])}-{sec_idx}"
                    
                    expanded.append({
                        'parent_id': parent_id,
                        'name': f"{row['name']}-{sec_idx}{part_suffix}",
                        'code': code_val,
                        'hours': h,
                        'semester': int(row['semester']) if pd.notna(row['semester']) else 0,
                        'section': sec_idx,
                        'total_sections': num_sections,
                        'instructor': row['lecturer']
                    })
                
        return pd.DataFrame(expanded)

class OptiSchedSolver:
    def __init__(self, df: pd.DataFrame, config: SchedulerConfig):
        self.df = df
        self.config = config
        self.model = cp_model.CpModel()
        self.assignments = {}
        self.result_data = []

    def build_model(self) -> None:
        self.start_vars = {}
        # 1. Variables
        for idx, row in self.df.iterrows():
            H = int(row['hours'])
            for d in self.config.days:
                for s in self.config.timeslots:
                    self.assignments[(idx, d, s)] = self.model.NewBoolVar(f"c{idx}_d{d}_s{s}")
                    if s + H <= len(self.config.timeslots):
                        self.start_vars[(idx, d, s)] = self.model.NewBoolVar(f"start_c{idx}_d{d}_s{s}")

        # 2. Total hours AND block continuity (Same day, consecutive hours)
        for idx, row in self.df.iterrows():
            H = int(row['hours'])
            valid_starts = []
            
            self.model.Add(sum(self.assignments[(idx, d, s)] for d in self.config.days for s in self.config.timeslots) == H)

            for d in self.config.days:
                for s in self.config.timeslots:
                    if s + H <= len(self.config.timeslots):
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
                for d in self.config.days:
                    day_active_vars = []
                    for idx in indices:
                        day_active = self.model.NewBoolVar(f"course_{parent_id}_part_{idx}_day_{d}")
                        self.model.Add(sum(self.assignments[(idx, d, s)] for s in self.config.timeslots) > 0).OnlyEnforceIf(day_active)
                        self.model.Add(sum(self.assignments[(idx, d, s)] for s in self.config.timeslots) == 0).OnlyEnforceIf(day_active.Not())
                        day_active_vars.append(day_active)
                    self.model.Add(sum(day_active_vars) <= 1)

        # 4. Global Conflicts (Semester Logic / Instructor)
        for instructor in self.df['instructor'].unique():
            if pd.isna(instructor) or str(instructor).strip() == '-' or str(instructor).strip().lower() == 'anonim': continue
            inst_group = self.df[self.df['instructor'] == instructor]
            for d in self.config.days:
                for s in self.config.timeslots:
                    self.model.Add(sum(self.assignments[(idx, d, s)] for idx in inst_group.index) <= 1)
        
        # Semester Conflict Logic
        self.overlap_vars = []
        max_sec = self.df['section'].max() if not self.df.empty else 1
        
        for d in self.config.days:
            for s in self.config.timeslots:
                for sem in range(1, 9):
                    for sec_id in range(1, max_sec + 1):
                        # Aynı şube numarasına sahip dersler VEYA sadece tek şubesi olup herkese zorunlu olan dersler
                        group_same = self.df[
                            (self.df['semester'] == sem) & 
                            ((self.df['section'] == sec_id) | (self.df['total_sections'] == 1))
                        ].index.tolist()
                        
                        group_next = self.df[
                            (self.df['semester'] == sem + 2) & 
                            ((self.df['section'] == sec_id) | (self.df['total_sections'] == 1))
                        ].index.tolist()
                        
                        if group_same:
                            # Aynı dönemin kendi içinde çakışması yasak (Hard constraint)
                            self.model.Add(sum(self.assignments[(idx, d, s)] for idx in group_same) <= 1)
                        if group_same and group_next:
                            # Alt-üst dönem çakışması (Soft constraint) - Mümkün mertebe kaçınılır
                            overlap_var = self.model.NewBoolVar(f"overlap_sem{sem}_{sem+2}_d{d}_s{s}_sec{sec_id}")
                            self.model.Add(sum(self.assignments[(idx, d, s)] for idx in group_same + group_next) <= 1).OnlyEnforceIf(overlap_var.Not())
                            self.overlap_vars.append(overlap_var)

        # Çakışmaları en aza indir (Minimize overlaps)
        if self.overlap_vars:
            self.model.Minimize(sum(self.overlap_vars))

    def solve(self, output_excel: str) -> None:
        solver = cp_model.CpSolver()
        solver.parameters.max_time_in_seconds = self.config.max_solve_time_seconds
        # Her çalıştırmada farklı sonuç üretmesi için rastgele seed
        solver.parameters.random_seed = random.randint(1, 100000)
        
        status = solver.Solve(self.model)
        if status in (cp_model.OPTIMAL, cp_model.FEASIBLE):
            for idx, row in self.df.iterrows():
                for d in self.config.days:
                    for s in self.config.timeslots:
                        if solver.Value(self.assignments[(idx, d, s)]):
                            self.result_data.append({
                                "Gün": self.config.day_map[d], 
                                "Saat": self.config.time_map[s], 
                                "Dönem": f"{int(row['semester'])}. Dönem",
                                "Dönem_Int": int(row['semester']),
                                "DersKodu": row['code'],
                                "DersDetay": str(row['code'])
                            })
            
            if not self.result_data:
                print("✅ Çözüm bulundu ancak programlanacak atanmış ders yok.")
                return
                
            df_res = pd.DataFrame(self.result_data)
            
            with pd.ExcelWriter(output_excel, engine='openpyxl') as writer:
                # Liste görünümünde iç kullanım değişkenini düşür
                df_list = df_res.drop(columns=['DersDetay', 'Dönem_Int']) if 'Dönem_Int' in df_res.columns else df_res
                df_list.to_excel(writer, sheet_name='Liste_Gorunumu', index=False)
                
                # Tüm Dönemler için Günlere Özel 5 Sayfa
                for d in self.config.days:
                    day_name = self.config.day_map[d]
                    day_df = df_res[df_res['Gün'] == day_name]
                    
                    if day_df.empty:
                        pd.DataFrame().to_excel(writer, sheet_name=day_name)
                        continue
                        
                    pivot_df = day_df.pivot_table(
                        index='Saat',
                        columns='Dönem',
                        values='DersDetay',
                        aggfunc=lambda x: '\n\n'.join(x)
                    ).fillna('')
                    
                    saat_sirasi = [self.config.time_map[s] for s in self.config.timeslots]
                    valid_rows = [r for r in saat_sirasi if r in pivot_df.index]
                    
                    unique_sems = sorted(day_df['Dönem_Int'].unique())
                    col_order = [f"{s}. Dönem" for s in unique_sems]
                    
                    pivot_df = pivot_df.reindex(index=valid_rows, columns=col_order).fillna('')
                    pivot_df.to_excel(writer, sheet_name=day_name)
                
            print(f"✅ Çizelge hazır: {output_excel}")
        else:
            print("❌ Çözüm bulunamadı!")

if __name__ == '__main__':
    term_input = input("Hangi dönem grubunu planlamak istiyorsunuz? Güz (G) / Bahar (B): ").strip().upper()
    if term_input not in ['G', 'B']:
        print("Lütfen geçerli bir seçim yapınız: G (Güz) veya B (Bahar)!")
        sys.exit(1)
        
    term_name = "Guz" if term_input == 'G' else "Bahar"
        
    conf = SchedulerConfig()
    loader = DataLoader()
    course_df = loader.load_data('data/bil 2.xlsx')
    
    # Sadece seçili olan yarıyılları(Fall/Spring) filtrele
    if term_input == 'G':
        course_df = course_df[course_df['semester'] % 2 != 0].reset_index(drop=True)
    else:
        course_df = course_df[course_df['semester'] % 2 == 0].reset_index(drop=True)
    
    print(f"Model oluşturuluyor... ({term_name} dönemi dersleri planlanıyor)")
    scheduler = OptiSchedSolver(course_df, conf)
    scheduler.build_model()
    
    out_file = f"output/ders_programi_{term_name}.xlsx"
    print(f"Çözülüyor... Sonuç '{out_file}' dosyasına yazılacak.")
    scheduler.solve(output_excel=out_file)
