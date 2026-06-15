import sys
import inquirer
import pandas as pd
from typing import Dict, List

from .config import SchedulerConfig
from .data import DBLoader
from .model import OptiSchedSolver
from .export import DataExporter
from .room_allocator import RoomAllocator
from .validator import (
    validate_schedule,
    validate_rooms,
    validate_global_instructor,
)

class MenuApp:
    def __init__(self, config_path: str = 'config.json'):
        self.config = SchedulerConfig.load_from_json(config_path)
        self.db_loader = DBLoader(self.config.db_config)
        self.df = pd.DataFrame()
        self.classrooms_df = pd.DataFrame()
        self.fixed_assignments: Dict[str, List[tuple]] = {}
        self.is_fall = True
        self.final_schedule = pd.DataFrame()

    def run(self):
        print("=== OptiSched V4 (Database + Interactive CLI) ===")
        # Term selection
        questions = [
            inquirer.List('term',
                          message="Hangi dönem grubunu planlamak istiyorsunuz?",
                          choices=['Güz (Fall)', 'Bahar (Spring)'],
                      ),
        ]
        answers = inquirer.prompt(questions)
        if not answers:
            sys.exit(0)
            
        self.is_fall = answers['term'].startswith('Güz')
        print("Veritabanından dersler çekiliyor...")
        self.df = self.db_loader.load_courses_for_term(is_fall=self.is_fall)
        
        if self.df.empty:
            print("Veri bulunamadı veya veritabanı bağlantısı koptu.")
            sys.exit(1)
        
        print(f"Toplam {len(self.df)} ders kaydı yüklendi.")
        
        print("Sınıflar yükleniyor...")
        self.classrooms_df = self.db_loader.load_classrooms()
        print(f"{len(self.classrooms_df)} sınıf yüklendi.")
        
        while True:
            self.main_menu()

    def main_menu(self):
        questions = [
            inquirer.List('action',
                          message="Ne yapmak istersiniz?",
                          choices=[
                              '1. Sıfırdan Program Oluştur (Önce Ortak, Sonra Bölümler)',
                              '2. Hazır Programı Dışarı Aktar (Bölümlere Göre Excel)',
                              '3. Çıkış'
                          ],
                      ),
        ]
        ans = inquirer.prompt(questions)
        if not ans:
            sys.exit(0)
            
        action = ans['action'][0]
        
        if action == '1':
            self.run_two_stage_scheduling()
        elif action == '2':
            self.export_schedules()
        elif action == '3':
            sys.exit(0)

    def run_two_stage_scheduling(self):
        # Aşama 1: Ortak Dersleri Planla
        # Varsayım: course_type_id == 4 veya departmanı olmayanlar vb. ortak derstir.
        # Bu senaryoda is_service == True veya course_type_id == 4 olanlar diyelim.
        # Şimdilik course_type_id == 4'ü ortak ders kabul edelim.
        print("\n--- Aşama 1: Ortak Derslerin Planlanması ---")
        common_df = self.df[self.df['course_type_id'] == 4].copy()
        
        if common_df.empty:
            print("Ortak ders bulunamadı, doğrudan 2. aşamaya geçiliyor.")
            self.fixed_assignments = {}
        else:
            print(f"Ortak dersler çözülüyor ({len(common_df)} kayıt)...")
            solver1 = OptiSchedSolver(common_df, self.config)
            solver1.build_model()
            res1 = solver1.solve()
            if res1.empty:
                print("Ortak dersler için çözüm bulunamadı!")
                return
            
            # Save assignments for pinning
            # The solve method currently returns a DataFrame, not the raw (d,s) mapping.
            # We need to extract the raw assignments or update the solver to return them.
            # We'll update the solver to expose a get_raw_assignments() method.
            self.fixed_assignments = solver1.get_raw_assignments()
            print("Ortak dersler başarıyla yerleştirildi ve sabitlendi.")

        # Aşama 2: Bölümlere özel yerleştirme (sıralı çöz → hocayı bölümler
        # arası çakışmadan koru)
        print("\n--- Aşama 2: Bölümlerin Planlanması ---")
        departments = self.df['department_id'].dropna().unique()
        all_results = []
        all_reports = []
        # Tek bir paylaşılan oda tahsisçisi → bölümler arası oda çakışması
        # engellenir (occupied_rooms tüm bölümler için ortak tutulur).
        allocator = RoomAllocator(self.classrooms_df)
        instructor_busy: Dict[str, set] = {}

        for dept in departments:
            dept_name_series = self.df[self.df['department_id'] == dept]['department_name'].values
            dept_name = dept_name_series[0] if len(dept_name_series) > 0 else f"Dept_{dept}"
            print(f"> {dept_name} planlanıyor...")

            # Select dept courses + common courses
            dept_df = self.df[(self.df['department_id'] == dept) | (self.df['course_type_id'] == 4)].copy()
            dept_df = dept_df.drop_duplicates(subset=['code']).reset_index(drop=True)

            solver2 = OptiSchedSolver(dept_df, self.config, self.fixed_assignments,
                                      instructor_busy=instructor_busy)
            solver2.build_model()
            res2 = solver2.solve()

            if res2.empty:
                print(f"❌ {dept_name} için çözüm bulunamadı!")
            else:
                # Kendi kendine doğrulama (H1–H7)
                report = validate_schedule(dept_df, solver2.get_index_assignments(),
                                           fixed_assignments=self.fixed_assignments)
                all_reports.append(report)

                # Bu bölümün hoca doluluklarını sonraki bölümlere aktar
                for idx, slots in solver2.get_index_assignments().items():
                    inst = str(dept_df.loc[idx, 'instructor']).strip()
                    if inst.lower() in ('-', 'anonim', ''):
                        continue
                    instructor_busy.setdefault(inst, set()).update(tuple(s) for s in slots)

                # Sınıf ataması (paylaşılan allocator → çakışma yok)
                res2 = allocator.allocate(res2)
                print(f"✅ {dept_name} başarıyla planlandı.")
                res2['Department'] = dept_name
                all_results.append(res2)

        if all_results:
            self.final_schedule = pd.concat(all_results, ignore_index=True)
            print("\nTüm bölümlerin programı başarıyla oluşturuldu!")

            # Birleşik program üzerinde global doğrulama (bölümler arası H4 + H8)
            errors = list(validate_global_instructor(self.final_schedule))
            errors += list(validate_rooms(self.final_schedule))
            hard = sum(len(r.errors) for r in all_reports) + len(errors)
            soft = sum(r.soft_overlap_count for r in all_reports)
            if hard == 0:
                print(f"✓ Doğrulama: tüm zor kısıtlar (H1–H8) sağlandı. "
                      f"({soft} yumuşak komşu-dönem örtüşmesi)")
            else:
                print(f"⚠ Doğrulama: {hard} zor kısıt ihlali tespit edildi:")
                for r in all_reports:
                    for v in r.errors:
                        print(f"   - {v}")
                for v in errors:
                    print(f"   - {v}")
        else:
            print("\nHiçbir bölüm için program oluşturulamadı.")

    def export_schedules(self):
        if self.final_schedule.empty:
            print("Dışa aktarılacak program yok! Önce program oluşturun.")
            return
            
        term_str = "Guz" if self.is_fall else "Bahar"
        departments = self.final_schedule['Department'].unique()
        
        print(f"\nExcel çıktıları {self.config.output_dir} dizinine kaydediliyor...")
        import os
        os.makedirs(self.config.output_dir, exist_ok=True)
        
        for dept in departments:
            dept_df = self.final_schedule[self.final_schedule['Department'] == dept].copy()
            # Yardımcı kolonları kaldır
            dept_df = dept_df.drop(columns=['d_idx', 's_idx', 'expected_student', 'course_type_id', 'is_service'], errors='ignore')
            # Clean department name for filename
            clean_name = str(dept).replace(" ", "_").replace("/", "_")
            filename = f"{self.config.output_dir}/{clean_name}_{term_str}.xlsx"
            
            DataExporter.export_excel(dept_df, filename, self.config.days, self.config.day_map, self.config.time_map)
            print(f"Kaydedildi: {filename}")

        # Derslik matrisi (oda × saat) — tüm bölümler tek dosyada
        from .matrix_export import placements_from_schedule_df, export_matrix_xlsx
        room_names = None
        if not self.classrooms_df.empty and 'classroom_name' in self.classrooms_df.columns:
            room_names = self.classrooms_df['classroom_name'].astype(str).tolist()
        placements = placements_from_schedule_df(self.final_schedule)
        matrix_file = f"{self.config.output_dir}/derslikMatris_{term_str}.xlsx"
        export_matrix_xlsx(placements, self.config, matrix_file, room_names=room_names)
        print(f"Kaydedildi (derslik matrisi): {matrix_file}")
