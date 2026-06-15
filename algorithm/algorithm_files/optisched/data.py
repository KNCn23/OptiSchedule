import re
import pandas as pd
import psycopg2
from typing import Dict


class DataLoader:
    """Excel dosyasından ders verisi yükler (legacy)."""
    @staticmethod
    def load_data(excel_file: str) -> pd.DataFrame:
        df = pd.read_excel(excel_file)
        expanded = []
        for i, row in df.iterrows():
            total_hours = int(row['hour']) if pd.notna(row['hour']) else 0
            if total_hours <= 0:
                continue
            num_sections = 1
            if 'section' in row and pd.notna(row['section']):
                num_sections = int(row['section'])
            elif 'seciton' in row and pd.notna(row['seciton']):
                num_sections = int(row['seciton'])
            if num_sections <= 0:
                num_sections = 1
            splits = _splits_for(total_hours)
            for sec_idx in range(1, num_sections + 1):
                for split_idx, h in enumerate(splits):
                    part_suffix = f" (P{split_idx+1})" if len(splits) > 1 else ""
                    expanded.append({
                        'parent_id':      f"{i}_{sec_idx}",
                        'name':           f"{row['name']}-{sec_idx}{part_suffix}",
                        'code':           f"{str(row['code'])}-{sec_idx}",
                        'hours':          h,
                        'semester':       int(row['semester']) if pd.notna(row['semester']) else 0,
                        'section':        sec_idx,
                        'total_sections': num_sections,
                        'instructor':     row['lecturer'] if 'lecturer' in row else '-',
                    })
        return pd.DataFrame(expanded)


# Programa hiç girmeyen ders kodu önekleri (GSB = Güzel Sanatlar ortak
# seçmelileri haftalık çizelge dışında yönetilir).
EXCLUDED_COURSE_CODE_PREFIXES = ('GSB',)


def _drop_excluded_courses(df: pd.DataFrame) -> pd.DataFrame:
    if df.empty or 'course_code' not in df.columns or not EXCLUDED_COURSE_CODE_PREFIXES:
        return df
    codes = df['course_code'].astype(str).str.strip().str.upper()
    return df[~codes.str.startswith(EXCLUDED_COURSE_CODE_PREFIXES)].copy()


def _splits_for(total_hours: int):
    if total_hours == 5:
        return [3, 2]
    elif total_hours == 4:
        return [2, 2]
    elif total_hours == 6:
        return [3, 3]
    return [total_hours]


def _parse_dept_ids(raw) -> list:
    """'{1,2,3}' veya '{7}' gibi PostgreSQL array string'ini int listesine çevirir."""
    if pd.isna(raw) or str(raw).strip() in ('', '{}', 'nan'):
        return []
    return [int(x) for x in re.findall(r'\d+', str(raw))]


class DBLoader:
    def __init__(self, db_config: Dict[str, str]):
        self.db_config = db_config

    # ------------------------------------------------------------------
    # sections_informations_with_headers.csv ana kaynak;
    # DB sadece course_semester, course_type_id, department_name için
    # kullanılır.
    # ------------------------------------------------------------------
    def load_courses_for_term(self, is_fall: bool = True,
                               csv_path: str = 'the_table_that_algorithm.csv',
                               sec_dept_path: str = 'section_departments.csv'
                               ) -> pd.DataFrame:

        # ── 1. CSV'leri oku ─────────────────────────────────────────
        csv_df  = pd.read_csv(csv_path)
        csv_df  = _drop_excluded_courses(csv_df)   # GSB vb. dersleri çıkar
        sd_df   = pd.read_csv(sec_dept_path)   # section_id → department_id

        # ── 2. DB'den tamamlayıcı veriler: semester, course_type, dept_name
        try:
            conn = psycopg2.connect(**self.db_config)
        except Exception as e:
            print(f"Veritabanına bağlanılamadı: {e}")
            return pd.DataFrame()

        try:
            courses_db = pd.read_sql_query(
                "SELECT course_id, course_semester, course_type_id FROM Courses", conn
            )
            depts_db = pd.read_sql_query(
                "SELECT department_id, department_name FROM Departments", conn
            )
        except Exception as e:
            print(f"DB sorgusu başarısız: {e}")
            conn.close()
            return pd.DataFrame()
        finally:
            conn.close()

        dept_map: Dict[int, str] = dict(
            zip(depts_db['department_id'], depts_db['department_name'])
        )

        # ── 3. Birleştir: CSV + courses_db ──────────────────────────
        df = csv_df.merge(courses_db, on='course_id', how='left')

        # is_online / is_service → bool garantile
        df['is_online']  = df['is_online'].astype(str).str.lower() == 'true'
        df['is_service'] = df['is_service'].astype(str).str.lower() == 'true'

        # ── 4. is_online olanları dışla ─────────────────────────────
        df = df[~df['is_online']].copy()

        # ── 5. Dönem filtresi ────────────────────────────────────────
        df['course_semester'] = pd.to_numeric(df['course_semester'], errors='coerce')
        df = df.dropna(subset=['course_semester'])
        df['course_semester'] = df['course_semester'].astype(int)

        if is_fall:
            df = df[df['course_semester'] % 2 != 0].copy()
        else:
            df = df[df['course_semester'] % 2 == 0].copy()

        if df.empty:
            return df

        # ── 6. section_departments.csv ile department ataması ────────
        # section_id → [department_id listesi]
        rows_exploded = []
        for _, row in df.iterrows():
            sid = int(row['section_id'])
            dept_ids = sd_df[sd_df['section_id'] == sid]['department_id'].tolist()
            if not dept_ids:
                continue  # departman tanımsız → atla
            for dept_id in dept_ids:
                dept_name = dept_map.get(int(dept_id), f"Dept_{dept_id}")
                rows_exploded.append({**row.to_dict(),
                                      'department_id':   int(dept_id),
                                      'department_name': dept_name})

        if not rows_exploded:
            return pd.DataFrame()

        df = pd.DataFrame(rows_exploded)

        # ── 7. Toplam şube sayısını hesapla ─────────────────────────
        total_sec_map = (
            df.groupby('course_id')['section_id']
            .nunique()
            .rename('total_sections')
        )
        df = df.join(total_sec_map, on='course_id')

        # ── 8. Saat parçalarına ayır ─────────────────────────────────
        expanded = []
        for _, row in df.iterrows():
            total_hours  = int(row['weekly_hours'])
            if total_hours <= 0:
                continue
            num_sections = int(row['total_sections'])
            sec_idx      = int(row['section_number'])
            splits       = _splits_for(total_hours)

            for split_idx, h in enumerate(splits):
                part_suffix = f" (P{split_idx+1})" if len(splits) > 1 else ""
                cap = int(row['capacity']) if pd.notna(row['capacity']) and row['capacity'] > 0 else 0

                expanded.append({
                    'parent_id':       f"{row['course_id']}_{row['section_id']}",
                    'name':            f"{row['course_name']}-{sec_idx}{part_suffix}",
                    'code':            f"{row['course_code']}-{sec_idx}",
                    'hours':           h,
                    'semester':        row['course_semester'],
                    'section':         sec_idx,
                    'total_sections':  num_sections,
                    'instructor':      str(row['instructor_full_name']) if pd.notna(row['instructor_full_name']) else '-',
                    'department_id':   row['department_id'],
                    'department_name': row['department_name'],
                    'course_type_id':  int(row['course_type_id']) if pd.notna(row['course_type_id']) else 1,
                    'expected_student': cap,
                    'section_id':      row['section_id'],
                    'is_service':      bool(row['is_service']),
                })

        return pd.DataFrame(expanded)

    def load_classrooms(self) -> pd.DataFrame:
        try:
            conn = psycopg2.connect(**self.db_config)
        except Exception as e:
            print(f"Sınıf veritabanına bağlanılamadı: {e}")
            return pd.DataFrame()
        try:
            df = pd.read_sql_query("SELECT * FROM Classrooms", conn)
        except Exception as e:
            print(f"Sınıflar yüklenemedi: {e}")
            return pd.DataFrame()
        finally:
            conn.close()
        return df
