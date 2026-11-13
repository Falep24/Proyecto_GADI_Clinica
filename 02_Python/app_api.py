from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
import pyodbc
import pandas as pd
import joblib
import os
from datetime import datetime, date

app = FastAPI(title="API Sonrisa Integral - BI & IA")

# Permitir peticiones desde el frontend (Google Stitch / AI Studio / React / HTML local)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configuración de conexión a SQL Server local
SERVER = r'localhost\SQLEXPRESS'
DATABASE = 'DentalCenterDB'

def get_db_connection():
    drivers = [d for d in pyodbc.drivers() if 'SQL Server' in d]
    if not drivers:
        raise Exception("No se encontró driver ODBC para SQL Server.")
    conn_str = f'DRIVER={{{drivers[-1]}}};SERVER={SERVER};DATABASE={DATABASE};Trusted_Connection=yes;TrustServerCertificate=yes;'
    return pyodbc.connect(conn_str)

# Carga del modelo Random Forest entrenado (si existe el .pkl)
MODEL_PATH = os.path.join(os.path.dirname(__file__), 'modelo_rf_dental.pkl')
rf_model = joblib.load(MODEL_PATH) if os.path.exists(MODEL_PATH) else None

# ==========================================
# ESQUEMAS DE DATOS (Pydantic)
# ==========================================
class PacienteModel(BaseModel):
    IdPaciente: int
    Genero: str = Field(..., pattern="^[MFmf]$")
    Edad: int = Field(..., ge=0, le=100)
    Barrio: str

class CitaModel(BaseModel):
    IdCita: int
    IdPaciente: int
    IdOdontologo: int
    IdTratamiento: int
    FechaProgramacion: str  # Formato 'YYYY-MM-DD HH:MM:SS' o 'YYYY-MM-DD'
    FechaCita: str          # Formato 'YYYY-MM-DD'
    SMSRecibido: int = 0
    NoShow: str = "No"
    CostoAplicado: float

class CitaUpdateModel(BaseModel):
    SMSRecibido: int
    NoShow: str

class SimulacionModel(BaseModel):
    Edad: int
    Genero: str
    SMSRecibido: int
    Tiempo_Espera_Dias: int
    Costo_Tratamiento_Sugerido: float
    Mes_Cita: int
    DiaSemana_Cita: int

# ==========================================
# PESTAÑA 1: CRUD PACIENTES (oltp.Pacientes)
# ==========================================
@app.get("/api/pacientes")
def listar_pacientes(limit: int = 100, buscar: str = ""):
    conn = get_db_connection()
    cursor = conn.cursor()
    if buscar:
        query = """
            SELECT TOP (?) IdPaciente, Genero, Edad, Barrio 
            FROM oltp.Pacientes 
            WHERE CAST(IdPaciente AS VARCHAR) LIKE ? OR Barrio LIKE ?
            ORDER BY IdPaciente DESC
        """
        cursor.execute(query, (limit, f"%{buscar}%", f"%{buscar}%"))
    else:
        cursor.execute("SELECT TOP (?) IdPaciente, Genero, Edad, Barrio FROM oltp.Pacientes ORDER BY IdPaciente DESC", (limit,))
    
    cols = [col[0] for col in cursor.description]
    resultados = [dict(zip(cols, row)) for row in cursor.fetchall()]
    conn.close()
    return resultados

@app.post("/api/pacientes")
def crear_paciente(p: PacienteModel):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute(
            "INSERT INTO oltp.Pacientes (IdPaciente, Genero, Edad, Barrio) VALUES (?, ?, ?, ?)",
            (p.IdPaciente, p.Genero.upper(), p.Edad, p.Barrio)
        )
        conn.commit()
        return {"mensaje": "Paciente registrado exitosamente en oltp.Pacientes"}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        conn.close()

@app.put("/api/pacientes/{id_paciente}")
def actualizar_paciente(id_paciente: int, p: PacienteModel):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        "UPDATE oltp.Pacientes SET Genero = ?, Edad = ?, Barrio = ? WHERE IdPaciente = ?",
        (p.Genero.upper(), p.Edad, p.Barrio, id_paciente)
    )
    conn.commit()
    conn.close()
    return {"mensaje": "Paciente actualizado"}

@app.delete("/api/pacientes/{id_paciente}")
def eliminar_paciente(id_paciente: int):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("DELETE FROM oltp.Pacientes WHERE IdPaciente = ?", (id_paciente,))
        conn.commit()
        return {"mensaje": "Paciente eliminado"}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=400, detail="No se puede eliminar porque tiene citas asociadas.")
    finally:
        conn.close()

# ==========================================
# PESTAÑA 2: CRUD CITAS + IA EN VIVO (oltp.Citas)
# ==========================================
@app.get("/api/citas")
def listar_citas(limit: int = 100):
    conn = get_db_connection()
    cursor = conn.cursor()
    query = """
        SELECT TOP (?) c.IdCita, c.IdPaciente, p.Edad, p.Barrio,
               c.IdOdontologo, o.Nombres + ' ' + o.Apellidos AS Odontologo, o.Especialidad,
               c.IdTratamiento, t.Descripcion AS Tratamiento,
               CONVERT(VARCHAR(19), c.FechaProgramacion, 120) AS FechaProgramacion,
               CONVERT(VARCHAR(10), c.FechaCita, 120) AS FechaCita,
               c.SMSRecibido, c.NoShow, CAST(c.CostoAplicado AS FLOAT) AS CostoAplicado
        FROM oltp.Citas c
        JOIN oltp.Pacientes p ON c.IdPaciente = p.IdPaciente
        JOIN oltp.Odontologos o ON c.IdOdontologo = o.IdOdontologo
        JOIN oltp.Tratamientos t ON c.IdTratamiento = t.IdTratamiento
        ORDER BY c.IdCita DESC
    """
    cursor.execute(query, (limit,))
    cols = [col[0] for col in cursor.description]
    resultados = [dict(zip(cols, row)) for row in cursor.fetchall()]
    conn.close()
    return resultados

@app.post("/api/citas")
def crear_cita(c: CitaModel):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("""
            INSERT INTO oltp.Citas 
            (IdCita, IdPaciente, IdOdontologo, IdTratamiento, FechaProgramacion, FechaCita, SMSRecibido, NoShow, CostoAplicado)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (c.IdCita, c.IdPaciente, c.IdOdontologo, c.IdTratamiento, c.FechaProgramacion, c.FechaCita, c.SMSRecibido, c.NoShow, c.CostoAplicado))
        conn.commit()
        return {"mensaje": "Cita agendada en oltp.Citas"}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        conn.close()

@app.put("/api/citas/{id_cita}/estado")
def actualizar_estado_cita(id_cita: int, datos: CitaUpdateModel):
    """Write-back directo: Actualiza SMSRecibido o NoShow en oltp.Citas y dm.Fact_Atenciones"""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        "UPDATE oltp.Citas SET SMSRecibido = ?, NoShow = ? WHERE IdCita = ?",
        (datos.SMSRecibido, datos.NoShow, id_cita)
    )
    # También reflejamos el cambio en el Data Mart para vista inmediata
    es_ausencia = 1 if datos.NoShow == 'Yes' else 0
    es_atendido = 0 if datos.NoShow == 'Yes' else 1
    estado_txt = 'Ausencia/No-Show' if datos.NoShow == 'Yes' else 'Atendido'
    cursor.execute("""
        UPDATE dm.Fact_Atenciones 
        SET SMSRecibido = ?, Estado_Cita = ?, Es_Atendido = ?, Es_Ausencia = ?
        WHERE IdCita = ?
    """, (datos.SMSRecibido, estado_txt, es_atendido, es_ausencia, id_cita))
    conn.commit()
    conn.close()
    return {"mensaje": f"Cita {id_cita} actualizada en OLTP y Data Mart"}

@app.delete("/api/citas/{id_cita}")
def eliminar_cita(id_cita: int):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM dm.Resultados_Prediccion_IA WHERE IdCita = ?", (id_cita,))
    cursor.execute("DELETE FROM dm.Fact_Atenciones WHERE IdCita = ?", (id_cita,))
    cursor.execute("DELETE FROM oltp.Citas WHERE IdCita = ?", (id_cita,))
    conn.commit()
    conn.close()
    return {"mensaje": "Cita eliminada"}

@app.post("/api/predecir-en-vivo")
def predecir_riesgo_en_vivo(sim: SimulacionModel):
    """Calcula la probabilidad en tiempo real mientras se agenda en la Pestaña 2"""
    genero_num = 1 if sim.Genero.upper() == 'M' else 0
    if rf_model is not None:
        X_nuevo = pd.DataFrame([{
            'Edad': sim.Edad,
            'Genero_Num': genero_num,
            'SMSRecibido': sim.SMSRecibido,
            'Tiempo_Espera_Dias': sim.Tiempo_Espera_Dias,
            'Costo_Tratamiento_Sugerido': sim.Costo_Tratamiento_Sugerido,
            'Mes_Cita': sim.Mes_Cita,
            'DiaSemana_Cita': sim.DiaSemana_Cita
        }])
        prob = float(rf_model.predict_proba(X_nuevo)[0, 1])
    else:
        # Heurística de respaldo calibrada con el Feature Importance si no se cargó el .pkl
        base = min(0.85, (sim.Tiempo_Espera_Dias * 0.022) + (0.15 if sim.Edad < 30 else 0.05))
        prob = max(0.05, base - (0.12 if sim.SMSRecibido == 1 else 0.0))

    riesgo = "Riesgo Alto" if prob >= 0.50 else ("Riesgo Medio" if prob >= 0.35 else "Riesgo Bajo")
    return {
        "Probabilidad_Inasistencia": round(prob, 4),
        "Nivel_Riesgo": riesgo,
        "Prediccion_Binary": 1 if prob >= 0.35 else 0
    }

# ==========================================
# PESTAÑA 3: BANDEJA DE RETENCIÓN E IA (dm)
# ==========================================
@app.get("/api/retencion")
def bandeja_retencion(riesgo: str = "Todos", limit: int = 100):
    conn = get_db_connection()
    cursor = conn.cursor()
    filtro = "WHERE r.Nivel_Riesgo = ?" if riesgo != "Todos" else ""
    query = f"""
        SELECT TOP (?) 
            f.IdCita, p.SK_Paciente, p.IdPaciente, p.Edad, p.Rango_Etario, p.Genero, p.Barrio,
            m.NombreCompleto AS Medico, m.Especialidad,
            t.Descripcion AS Tratamiento, CAST(t.Costo_Total AS FLOAT) AS Costo_Total,
            f.Tiempo_Espera_Dias, f.SMSRecibido, f.Estado_Cita,
            CAST(r.Probabilidad_Inasistencia AS FLOAT) AS Probabilidad_Inasistencia,
            r.Nivel_Riesgo, r.Prediccion_Binary
        FROM dm.Fact_Atenciones f
        JOIN dm.Dim_Paciente p ON f.SK_Paciente = p.SK_Paciente
        JOIN dm.Dim_Medico m ON f.SK_Medico = m.SK_Medico
        JOIN dm.Dim_Tratamiento t ON f.SK_Tratamiento = t.SK_Tratamiento
        JOIN dm.Resultados_Prediccion_IA r ON f.IdCita = r.IdCita
        {filtro}
        ORDER BY r.Probabilidad_Inasistencia DESC
    """
    params = (limit, riesgo) if riesgo != "Todos" else (limit,)
    cursor.execute(query, params)
    cols = [col[0] for col in cursor.description]
    resultados = [dict(zip(cols, row)) for row in cursor.fetchall()]
    conn.close()
    return resultados

# ==========================================
# PESTAÑAS 4 Y 5: KPIs, MONITOR Y SINCRONIZACIÓN ETL
# ==========================================
@app.get("/api/kpis-monitor")
def obtener_kpis_y_monitor():
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # KPIs Globales del Data Mart
    cursor.execute("""
        SELECT 
            COUNT(*) AS TotalCitas,
            SUM(f.Es_Ausencia) AS TotalAusencias,
            CAST(SUM(f.Es_Ausencia) * 100.0 / NULLIF(COUNT(*), 0) AS DECIMAL(5,2)) AS TasaInasistencia,
            AVG(CAST(f.Tiempo_Espera_Dias AS FLOAT)) AS EsperaPromedio,
            SUM(CASE WHEN f.Es_Ausencia = 1 THEN t.Costo_Total ELSE 0 END) AS IngresosEnRiesgo
        FROM dm.Fact_Atenciones f
        JOIN dm.Dim_Tratamiento t ON f.SK_Tratamiento = t.SK_Tratamiento
    """)
    row_kpi = cursor.fetchone()
    
    # Conteos de Arquitectura (stg -> oltp -> dm)
    cursor.execute("""
        SELECT 
            (SELECT COUNT(*) FROM stg.Rechazos_Ingesta) AS stg_rechazos,
            (SELECT COUNT(*) FROM oltp.Pacientes) AS oltp_pacientes,
            (SELECT COUNT(*) FROM oltp.Citas) AS oltp_citas,
            (SELECT COUNT(*) FROM dm.Fact_Atenciones) AS dm_hechos,
            (SELECT COUNT(*) FROM dm.Resultados_Prediccion_IA) AS dm_predicciones
    """)
    row_mon = cursor.fetchone()
    conn.close()

    return {
        "kpis": {
            "TotalCitas": row_kpi[0] or 0,
            "TotalAusencias": row_kpi[1] or 0,
            "TasaInasistencia": float(row_kpi[2] or 0.0),
            "EsperaPromedio": round(float(row_kpi[3] or 0.0), 1),
            "IngresosEnRiesgo": float(row_kpi[4] or 0.0)
        },
        "monitor": {
            "stg_rechazos": row_mon[0],
            "oltp_pacientes": row_mon[1],
            "oltp_citas": row_mon[2],
            "dm_hechos": row_mon[3],
            "dm_predicciones": row_mon[4]
        }
    }

@app.post("/api/sincronizar-datamart")
def sincronizar_etl_y_scoring():
    """Ejecuta el ETL hacia el Data Mart y puntúa las citas nuevas con Random Forest"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # 1. Ejecutar procedimiento almacenado del Data Mart
    cursor.execute("EXEC dm.usp_ETL_CargarDataMart;")
    conn.commit()
    
    # 2. Buscar citas en dm.vw_Dataset_ML que aún no tengan predicción en dm.Resultados_Prediccion_IA
    df_nuevas = pd.read_sql("""
        SELECT v.* FROM dm.vw_Dataset_ML v
        LEFT JOIN dm.Resultados_Prediccion_IA r ON v.IdCita = r.IdCita
        WHERE r.IdCita IS NULL
    """, conn)
    
    nuevas_insertadas = 0
    if not df_nuevas.empty and rf_model is not None:
        df_nuevas['Genero_Num'] = df_nuevas['Genero'].map({'F': 0, 'M': 1}).fillna(0)
        X_nuevas = df_nuevas[['Edad', 'Genero_Num', 'SMSRecibido', 'Tiempo_Espera_Dias', 
                              'Costo_Tratamiento_Sugerido', 'Mes_Cita', 'DiaSemana_Cita']]
        probs = rf_model.predict_proba(X_nuevas)[:, 1]
        
        datos_insert = []
        for idx, row in df_nuevas.iterrows():
            p = float(probs[idx])
            riesgo = 'Riesgo Alto' if p >= 0.50 else ('Riesgo Medio' if p >= 0.35 else 'Riesgo Bajo')
            pred_bin = 1 if p >= 0.35 else 0
            datos_insert.append((int(row['IdCita']), int(row['SK_Paciente']), p, riesgo, pred_bin))
            
        cursor.executemany("""
            INSERT INTO dm.Resultados_Prediccion_IA 
            (IdCita, SK_Paciente, Probabilidad_Inasistencia, Nivel_Riesgo, Prediccion_Binary)
            VALUES (?, ?, ?, ?, ?)
        """, datos_insert)
        conn.commit()
        nuevas_insertadas = len(datos_insert)
        
    conn.close()
    return {
        "mensaje": "Sincronización ETL y Scoring completada",
        "nuevas_citas_evaluadas": nuevas_insertadas
    }