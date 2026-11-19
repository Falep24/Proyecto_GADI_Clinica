# SISTEMA INTELIGENTE DE GESTIÓN, PREDICCIÓN Y FIDELIZACIÓN DE PACIENTES PARA UN CENTRO DENTAL (GADI)

## 1. DESCRIPCIÓN DEL PROYECTO

Solución **End-to-End** de Ingeniería de Datos, Inteligencia de Negocios (BI), Machine Learning (IA) y Aplicación Web Transaccional/Analítica diseñada para detectar, predecir y mitigar la tasa de inasistencia (*No-Show*) y abandono de tratamientos en clínicas odontológicas, cuantificando la exposición financiera en tiempo real y permitiendo ejecutar acciones preventivas (*Write-Back* de recordatorios SMS, reprogramación de citas y sincronización ETL bajo demanda).

---

## 2. ARQUITECTURA DE LA SOLUCIÓN

1. **CAPA DE DATOS (`SQL Server — Instancia SQLEXPRESS / Base DentalCenterDB`)**:
   - **Esquema Staging (`stg`)**: Aterrizaje de datos crudos (`stg.Raw_NoShow`, `stg.Raw_CPMS`) y auditoría de calidad de datos (`stg.Rechazos_Ingesta`).
   - **Esquema Transaccional (`oltp`)**: Modelo relacional normalizado (`oltp.Pacientes`, `oltp.Odontologos`, `oltp.Tratamientos`, `oltp.Citas`) cargado mediante el procedimiento `stg.usp_CargarOLTP`.
   - **Esquema Data Mart (`dm`)**: Modelo Dimensional en Esquema Estrella (*Star Schema* de Kimball) compuesto por las dimensiones `dm.Dim_Paciente`, `dm.Dim_Medico`, `dm.Dim_Tratamiento`, `dm.Dim_Tiempo`, la tabla de hechos `dm.Fact_Atenciones`, la tabla de inferencias `dm.Resultados_Prediccion_IA` y las vistas analíticas `dm.vw_KPI_TasaAbandono` y `dm.vw_Dataset_ML`, alimentadas por `dm.usp_ETL_CargarDataMart`.

2. **CAPA DE MACHINE LEARNING (`02_Python/modulo_ia.ipynb` y `modelo_rf_dental.pkl`)**:
   - Modelo de clasificación **Random Forest (`RandomForestClassifier`)** entrenado con Scikit-Learn y optimizado mediante `GridSearchCV` + `StratifiedKFold` maximizando la sensibilidad (`Recall = 96.23%` con umbral preventivo `0.35`).
   - Evaluación a nivel paciente único (`SK_Paciente`) sobre un universo de **92,901 pacientes** y **210,533 citas** a partir de 9 características agregadas (`Edad`, `Genero_Num`, `Promedio_Espera_Dias`, `Max_Espera_Dias`, `Ratio_SMS`, `Costo_Promedio`, `Costo_Maximo`, `Mes_Ultima_Cita`, `DiaSemana_Ultima_Cita`).
   - Generación de probabilidades *Out-of-Fold* exportadas a `dm.Resultados_Prediccion_IA` (`Probabilidad_Abandono`, `Nivel_Riesgo`: *Riesgo Alto* $\ge 50\%$, *Riesgo Medio* $35\%-49\%$, *Riesgo Bajo* $< 35\%$, y `Prediccion_Binary`) y serialización del modelo en `modelo_rf_dental.pkl`.

3. **CAPA BACKEND & API REST (`02_Python/app_api.py`)**:
   - Servicio construido con **FastAPI** y **Uvicorn** conectado en vivo a `localhost\SQLEXPRESS` (`pyodbc`) y al modelo `modelo_rf_dental.pkl` (`joblib`).
   - Provee endpoints para el CRUD transaccional de pacientes y citas, catálogos oficiales (`oltp.Tratamientos` y `oltp.Odontologos`), inferencia predictiva en tiempo real (`/api/predecir-en-vivo`), bandeja de retención con *Write-Back* y re-scoring (`/api/retencion/{id_cita}/confirmar-sms`), KPIs ejecutivos (`/api/kpis-monitor`) y ejecución remota de pipelines ETL (`/api/etl/cargar-oltp` y `/api/sincronizar-datamart`).

4. **CAPA FRONTEND WEB (`06_WebApp`)**:
   - Aplicación web interactiva desarrollada con **React 19**, **TypeScript**, **Tailwind CSS 4** y **Vite** (**Sonrisa Integral — Centro de Comando BI & IA**).
   - Integra 5 módulos conectados en vivo a FastAPI y SQL Server:
     1. **Gestión de Pacientes (`oltp.Pacientes`)**: Padrón maestro con búsqueda en servidor, alta, edición, validación de integridad referencial (`FK_Citas_Pacientes`) y exportación CSV.
     2. **Agendamiento & Citas IA (`oltp.Citas`)**: Registro de citas con velocímetro predictivo No-Show en tiempo real, control de asistencia, confirmación SMS y reprogramación.
     3. **Power BI & KPIs (`dm.Fact_Atenciones`)**: Cuadro de mando integral con métricas ejecutivas en vivo, visor de reportes y simulador *What-If*.
     4. **Agenda Inteligente & Retención (`dm.Resultados_Prediccion_IA`)**: Matriz priorizada por riesgo de abandono con *Write-Back* directo a SQL Server y recálculo de probabilidad con Random Forest.
     5. **Simulador Prescriptivo & Pipeline ETL (`stg → oltp → dm`)**: Calculadora de riesgo en mostrador, monitor de conteos por capa y consola de telemetría T-SQL.

5. **CAPA DE ANALÍTICA EJECUTIVA (`03_PowerBI`)**:
   - Tableros `.pbix` conectados al Data Mart dimensional en SQL Server con módulos Ejecutivo, Predictivo IA y Simulador *What-If* DAX.

---

## 3. INTEGRANTES DEL EQUIPO

- Borromeo Quispe, Allimson Julissa
- Huere Marchan, Manfred
- Lozano Villalobos, Alex
- Pauca Muñoz, Fabrizzio Alejandro
- Pacheco Antón, Fátima de los Ángeles

---

## 4. ESTRUCTURA ACTUAL DEL PROYECTO

```text
📁 Proyecto_GADI_Clinica/
│
├── 📁 01_SQL/
│   ├── 01_DDL_Creacion_Estructura.sql       # Creación de BD DentalCenterDB y esquemas stg, oltp y dm
│   ├── 02_Logica_Procesos_ETL.sql           # Procedimientos stg.usp_CargarOLTP, dm.usp_ETL_CargarDataMart y vistas
│   ├── 03_DML_Ejecucion_Cargas.sql          # BULK INSERT desde CSVs y ejecución inicial de los ETL
│   ├── 04_Revision_Cargas.sql               # Consultas rápidas de inspección de tablas por esquema
│   └── 05_test.sql                          # Suite de auditoría E2E (WebApp -> FastAPI -> SQL Server -> IA)
│
├── 📁 02_Python/
│   ├── app_api.py                           # Backend FastAPI conectado a SQL Server y modelo_rf_dental.pkl
│   ├── integrar_datasets.py                 # Script de unión y limpieza de CSVs hacia consolidado_clinica_dental.csv
│   ├── modelo_rf_dental.pkl                 # Modelo Random Forest entrenado y serializado con joblib
│   └── modulo_ia.ipynb                      # Notebook de entrenamiento, evaluación, exportación OOF y serialización
│
├── 📁 03_PowerBI/
│   ├── Dashboard_Prediccion_Abandono_Dental.pbix
│   ├── POWER BI - GADI OF.pbix
│   └── Link - Power BI
│
├── 📁 04_Documentacion/
│   ├── Flujo_Modulo_IA_GADI_Clinica.md      # Documentación técnica detallada del modelo IA y su uso en la web
│   └── Informe Final GADI 2026 — Sistema Inteligente de Gestión, Predicción y Fidelización de Pacientes para un Centro Dental.docx
│
├── 📁 05_Datasets/
│   ├── KaggleV2-May-2016.csv                # Dataset base de citas médicas
│   ├── Registro_clinica_dental.csv          # Registros complementarios de clínica dental
│   ├── consolidado_clinica_dental.csv       # Dataset consolidado (210,577 filas) para BULK INSERT en stg.Raw_NoShow
│   ├── cpms_odontologia.csv                 # Catálogo de procedimientos odontológicos para stg.Raw_CPMS
│   └── mtsamples.csv
│
├── 📁 06_WebApp/
│   ├── 📁 public/
│   ├── 📁 src/
│   │   ├── 📁 components/                   # AppShell.tsx (navegación y estado FastAPI) y SqlConsole.tsx
│   │   ├── 📁 context/                      # ClinicalContext.tsx (estado global y sincronización REST)
│   │   ├── 📁 data/                         # initialData.ts (catálogos base y distritos)
│   │   ├── 📁 pages/                        # 5 vistas principales (Pacientes, Citas, PowerBI, Retención, Simulador ETL)
│   │   ├── 📁 services/                     # api.ts (cliente HTTP hacia FastAPI)
│   │   ├── 📁 types/                        # clinical.ts (interfaces TypeScript)
│   │   ├── App.tsx
│   │   └── main.tsx
│   ├── .env                                 # Configuración de VITE_API_BASE_URL=http://localhost:8000
│   ├── .env.example
│   ├── package.json
│   ├── tsconfig.json
│   └── vite.config.ts
│
├── auditoria_errores.md                     # Reporte de auditoría técnica del sistema
├── GEMINI.md                                # Reglas y contexto de arquitectura del proyecto
└── README.md                                # Este documento
```

---

## 5. REQUISITOS PREVIOS

- **Motor de Base de Datos**: SQL Server Express (`localhost\SQLEXPRESS`) o Developer Edition + SQL Server Management Studio (SSMS) y **ODBC Driver 17 / 18 for SQL Server**.
- **Entorno Python**: Python 3.11+ con los paquetes:
  ```powershell
  pip install fastapi uvicorn pyodbc pandas numpy scikit-learn joblib matplotlib seaborn
  ```
- **Entorno Frontend**: Node.js 20+ y `npm`.
- **Analítica**: Microsoft Power BI Desktop (para abrir los archivos `.pbix`).

---

## 6. INSTRUCCIONES PARA EJECUTAR EL PROYECTO DE INICIO A FIN

### PASO 1: Consolidación de Datasets (Opcional si ya existe `consolidado_clinica_dental.csv`)
El archivo `05_Datasets/consolidado_clinica_dental.csv` ya se encuentra generado. Si deseas regenerarlo a partir de `KaggleV2-May-2016.csv` y `Registro_clinica_dental.csv`:
```powershell
cd 02_Python
python integrar_datasets.py
```

### PASO 2: Creación de Base de Datos y Carga ETL en SQL Server (`01_SQL`)
Abre **SQL Server Management Studio (SSMS)** conectado a tu instancia `localhost\SQLEXPRESS` y ejecuta los scripts de la carpeta `01_SQL` en el siguiente orden estricto:
1. **`01_DDL_Creacion_Estructura.sql`**: Crea la base de datos `DentalCenterDB`, los esquemas `stg`, `oltp` y `dm`, y todas las tablas relacionales y dimensionales.
2. **`02_Logica_Procesos_ETL.sql`**: Compila los procedimientos almacenados `stg.usp_CargarOLTP` y `dm.usp_ETL_CargarDataMart`, así como las vistas `dm.vw_KPI_TasaAbandono` y `dm.vw_Dataset_ML`.
3. **`03_DML_Ejecucion_Cargas.sql`**:
   - *Nota*: Verifica en las líneas 17 y 21 que la ruta de los archivos `consolidado_clinica_dental.csv` y `cpms_odontologia.csv` coincida con la ruta de tu carpeta `05_Datasets`.
   - Ejecuta el script para realizar el `BULK INSERT` en Staging, poblar los odontólogos base y correr `EXEC stg.usp_CargarOLTP;` y `EXEC dm.usp_ETL_CargarDataMart;`.
4. **`04_Revision_Cargas.sql`** *(Opcional)*:Verifica que las tablas `oltp.Pacientes` (~92,901 filas), `oltp.Citas` (~210,533 filas) y `dm.Fact_Atenciones` (~210,533 filas) tengan sus registros completos.

### PASO 3: Entrenamiento del Modelo IA y Poblado de `dm.Resultados_Prediccion_IA` (`02_Python`)
1. Abre y ejecuta todas las celdas del notebook **`02_Python/modulo_ia.ipynb`** (en VS Code o Jupyter Lab).
2. El notebook:
   - Extraerá los datos desde `dm.vw_Dataset_ML`.
   - Entrenará y seleccionará el modelo Random Forest óptimo.
   - Insertará las **92,901 predicciones** en la tabla `dm.Resultados_Prediccion_IA`.
   - Exportará el archivo binario **`02_Python/modelo_rf_dental.pkl`**.

### PASO 4: Levantar el Servidor Backend FastAPI (`Puerto 8000`)
Abre una terminal de PowerShell, sitúate en `02_Python` e inicia Uvicorn:
```powershell
cd C:\Users\fabri\Downloads\Proyecto_GADI_Clinica\02_Python
python -m uvicorn app_api:app --host 0.0.0.0 --port 8000
```
- Puedes verificar la documentación interactiva Swagger de la API en: `http://localhost:8000/docs`
- *Variables de entorno opcionales*: Si tu instancia de SQL Server tiene otro nombre, define `$env:SQL_SERVER = "TU_SERVIDOR\SQLEXPRESS"` antes de iniciar Uvicorn.

### PASO 5: Levantar la Aplicación Web React + Vite (`Puerto 3000`)
Abre una **segunda terminal** de PowerShell, sitúate en `06_WebApp` e inicia el servidor de desarrollo:
```powershell
cd C:\Users\fabri\Downloads\Proyecto_GADI_Clinica\06_WebApp
# Solo la primera vez si no existe la carpeta node_modules:
npm install --legacy-peer-deps

# Iniciar la aplicación web:
npm run dev
```
- Abre en tu navegador: **`http://localhost:3000`**
- Comprueba que el indicador en la barra superior muestre **`FastAPI OK`** en color verde.

### PASO 6: Verificación Funcional End-to-End y Auditoría en SQL Server
1. Desde la aplicación web (`http://localhost:3000`), puedes registrar nuevos pacientes en **Pacientes (CRUD)**, agendar citas con inferencia en vivo en **Citas & Asistente IA**, sincronizar el Data Mart con el botón **Sincronizar con Data Mart** y confirmar recordatorios SMS en **Retención IA**.
2. Para auditar en SQL Server los registros insertados desde la web y sus puntajes de Machine Learning, ejecuta en SSMS el script:
   - **`01_SQL/05_test.sql`**

### PASO 7: Visualización en Power BI Desktop (`03_PowerBI`)
1. Abre **`03_PowerBI/POWER BI - GADI OF.pbix`** (o `Dashboard_Prediccion_Abandono_Dental.pbix`) en Power BI Desktop.
2. Haz clic en **Actualizar (Refresh)** en la cinta superior para consumir los datos más recientes sincronizados en el esquema `dm` de `DentalCenterDB`.
