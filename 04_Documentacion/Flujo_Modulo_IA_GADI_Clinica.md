# Documentación Técnica: Flujo Completo del Módulo de Inteligencia Artificial (`02_Python/modulo_ia.ipynb`) y su Integración en la Aplicación Web GADI

**Proyecto**: Sistema Inteligente de Gestión, Predicción y Fidelización de Pacientes para un Centro Dental (GADI)  
**Archivo Fuente de Entrenamiento**: `02_Python/modulo_ia.ipynb`  
**Artefacto Serializado**: `02_Python/modelo_rf_dental.pkl`  
**Motor de Base de Datos**: SQL Server (`SQLEXPRESS` — `DentalCenterDB`)  
**API Backend & Inferencia**: `02_Python/app_api.py` (FastAPI)  
**Aplicación Web**: `06_WebApp` (React + TypeScript + Vite)

---

## 1. Definición del Problema Empresarial y Unidad de Análisis

En la gestión clínica odontológica, los tratamientos suelen requerir múltiples sesiones sucesivas (endodoncias, ortodoncia, rehabilitación oral, periodoncia). Cuando un paciente falta a sus citas (*No-Show*), no solo se genera una pérdida financiera directa por hora-sillón ociosa, sino que se interrumpe la continuidad clínica del tratamiento.

Para alinear el modelo de Machine Learning con el objetivo estratégico del **Sistema GADI**, en `02_Python/modulo_ia.ipynb` se reestructuró la granularidad del análisis:
- **De nivel transaccional (`IdCita`) a nivel dimensional (`SK_Paciente`)**: Cada fila del dataset de entrenamiento representa a un **paciente único** del Data Mart (`dm.Dim_Paciente`, con un universo base de **92,901 pacientes únicos** generados a partir de **210,533 citas**).
- **Regla de Negocio para la Variable Objetivo (`Target_Abandono = 1`)**:
  Un paciente se clasifica en estado de abandono o riesgo crítico de deserción (`1`, que representa el **21.85%** del padrón; frente a `0`, que representa el **78.15%**) si cumple al menos uno de los dos escenarios clínicos:
  1. **Abandono Crítico (`Ultima_Cita_Ausencia == 1`)**: El paciente faltó a la última cita registrada en su historial, rompiendo la cadena activa de atención.
  2. **Abandono Crónico / Deserción Progresiva (`Tasa_Ausencia_Historica >= 0.50`)**: El paciente faltó al 50% o más del total de sus citas históricas programadas.

---

## 2. Extracción desde el Data Mart e Ingeniería de Características (Feature Engineering)

### 2.1. Fuente de Datos SQL (`dm.vw_Dataset_ML`)
El notebook se conecta mediante `pyodbc` a la instancia local `localhost\SQLEXPRESS` (`DentalCenterDB`) y extrae los registros históricos desde la vista analítica `dm.vw_Dataset_ML` ordenada cronológicamente por paciente y cita (`ORDER BY SK_Paciente, IdCita`):

```sql
SELECT 
    f.IdCita,
    p.SK_Paciente,
    p.Edad, 
    p.Genero,
    f.SMSRecibido,
    f.Tiempo_Espera_Dias,
    t.Costo_Total AS Costo_Tratamiento_Sugerido,
    DATEPART(MONTH, time.Fecha) AS Mes_Cita,
    DATEPART(WEEKDAY, time.Fecha) AS DiaSemana_Cita,
    f.Es_Ausencia AS Target_Inasistencia 
FROM dm.Fact_Atenciones f
JOIN dm.Dim_Paciente p ON f.SK_Paciente = p.SK_Paciente
JOIN dm.Dim_Tratamiento t ON f.SK_Tratamiento = t.SK_Tratamiento
JOIN dm.Dim_Tiempo time ON f.SK_Tiempo = time.SK_Tiempo
WHERE f.Estado_Cita <> 'Pendiente';
```

### 2.2. Transformación y Agregación por Paciente (`groupby('SK_Paciente')`)
Dado que los algoritmos de Scikit-Learn requieren vectores numéricos, el campo `Genero` se codifica en `Genero_Num` (`F -> 0`, `M -> 1`) y `SMSRecibido` se convierte a entero (`0` o `1`). Luego se agrupa el historial de citas por `SK_Paciente` construyendo exactamente **9 variables predictoras ($X$)** y **2 variables auxiliares** (usadas exclusivamente para etiquetar $y = \text{Target\_Abandono}$ y luego eliminadas con `.drop()` para evitar *Data Leakage* directo de las columnas auxiliares):

| # | Variable Predictora ($X$) | Función de Agregación | Significado Clínico y Operativo |
| :- | :--- | :--- | :--- |
| 1 | `Edad` | `last` (última cita) | Edad actual registrada del paciente (`0` a `100` años). |
| 2 | `Genero_Num` | `first` | Codificación binaria del género (`0 = Femenino`, `1 = Masculino`). |
| 3 | `Promedio_Espera_Dias` | `mean` | Promedio histórico de días entre la fecha de programación y la fecha de cita. |
| 4 | `Max_Espera_Dias` | `max` | Mayor tiempo de espera (en días) que ha experimentado el paciente. |
| 5 | `Ratio_SMS` | `mean` | Proporción de citas del paciente que contaron con recordatorio SMS (`0.0` a `1.0`). |
| 6 | `Costo_Promedio` | `mean` | Arancel promedio de los procedimientos odontológicos del paciente (S/). |
| 7 | `Costo_Maximo` | `max` | Arancel máximo de tratamiento agendado por el paciente (S/). |
| 8 | `Mes_Ultima_Cita` | `last` (última cita) | Mes calendario (`1..12`) de su cita más reciente (estacionalidad). |
| 9 | `DiaSemana_Ultima_Cita` | `last` (última cita) | Día de la semana (`1..7`) de su cita más reciente. |

---

## 3. Elaboración, Entrenamiento y Selección del Modelo de Machine Learning

### 3.1. División Estratificada (`train_test_split`)
Al estar el dataset consolidado a 1 fila por `SK_Paciente`, una partición estratificada (`stratify=y`, `test_size=0.20`, `random_state=42`) garantiza que:
1. Ningún paciente aparezca simultáneamente en entrenamiento (`X_train`, 80%) y prueba (`X_test`, 20%).
2. Se conserve exactamente la proporción original de la clase minoritaria (`21.85%` de abandono) en ambos subconjuntos.

### 3.2. Comparativa de Modelos: Regresión Logística vs. Random Forest Optimizado
En el ámbito de retención clínica, **el error más costoso es el Falso Negativo** (no detectar a un paciente que va a abandonar su tratamiento y perder la oportunidad de enviarle un recordatorio o adelantar su cita). Por ello, la métrica rectora de optimización fue la **Sensibilidad (`Recall`)** sobre la clase positiva (`Target_Abandono = 1`).

1. **Modelo Base — Regresión Logística (`LogisticRegression`)**:
   - Configurado con `max_iter=1000` y `class_weight='balanced'`.
   - **Resultados en Test**:
     - `Accuracy`: **0.6522** (65.22%)
     - `Recall`: **0.5603** (56.03%) — Deja escapar al 44% de los pacientes que abandonan.
     - `F1-Score`: **0.4132**

2. **Modelo Seleccionado — Random Forest Classifier con `GridSearchCV`**:
   - Se ejecutó una búsqueda exhaustiva en malla (`GridSearchCV`) con validación cruzada estratificada de 3 pliegues (`StratifiedKFold(n_splits=3, shuffle=True, random_state=42)`), evaluando 36 combinaciones (108 ajustes) optimizando `scoring='recall'`:
     - `max_depth`: `[8, 10, 12]`
     - `class_weight`: `['balanced', {0: 1, 1: 4}, {0: 1, 1: 5}]`
     - `min_samples_leaf`: `[10, 20]`
     - `n_estimators`: `[100, 150]`
   - **Mejores Hiperparámetros Encontrados (`best_params_`)**:
     ```python
     {
         'class_weight': {0: 1, 1: 5},
         'max_depth': 8,
         'min_samples_leaf': 20,
         'n_estimators': 100
     }
     ```
   - **Calibración del Umbral de Decisión Preventivo (`umbral_decision = 0.35`)**:
     En lugar de utilizar el corte estándar de `0.50`, se estableció un umbral preventivo de **`0.35`** (35%) para activar alertas tempranas desde riesgo moderado:
     - `Recall`: **0.9623** (**96.23%** de los pacientes en abandono son capturados exitosamente por el sistema de alertas).
     - `F1-Score`: **0.4217** (superior al `0.4132` de la Regresión Logística).
     - `Accuracy`: **0.4232** (trade-off intencional derivado del peso `{0: 1, 1: 5}` y el umbral preventivo `0.35` para maximizar la captura clínica de deserciones).

---

## 4. Exportación de Predicciones a SQL Server (`dm.Resultados_Prediccion_IA`)

Para poblar la tabla dimensional `dm.Resultados_Prediccion_IA` con los **92,901 pacientes** sin caer en sobreajuste (evitando predecir sobre la misma partición con la que cada árbol fue entrenado), la Sección 5 del notebook implementa **Predicciones Out-of-Fold (`cross_val_predict`)**:

1. **Inferencia Out-of-Fold (5-Fold Stratified CV)**:
   ```python
   skf_oof = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
   probs_oof = cross_val_predict(
       best_rf_model, X, y, cv=skf_oof, method='predict_proba', n_jobs=-1
   )[:, 1]
   df_pacientes['Probabilidad_Abandono'] = np.round(probs_oof, 4)
   ```
2. **Segmentación en 3 Niveles de Riesgo Clínico**:
   - **Riesgo Alto**: `Probabilidad_Abandono >= 0.50` ($\ge 50\%$)
   - **Riesgo Medio**: `0.35 <= Probabilidad_Abandono < 0.50` ($35\% - 49\%$)
   - **Riesgo Bajo**: `Probabilidad_Abandono < 0.35` ($< 35\%$)
   - **Predicción Binaria (`Prediccion_Binary`)**: `1` si `Probabilidad_Abandono >= 0.35`, de lo contrario `0`.

3. **Carga Masiva de Alta Velocidad (`fast_executemany = True`)**:
   Se limpia la tabla destino (`TRUNCATE TABLE dm.Resultados_Prediccion_IA;`) y se insertan en bloque las tuplas `(SK_Paciente, Probabilidad_Abandono, Nivel_Riesgo, Prediccion_Binary)` en `dm.Resultados_Prediccion_IA`, dejando los resultados disponibles de inmediato tanto para **Power BI** como para la **Aplicación Web**.

---

## 5. Serialización del Modelo (`modelo_rf_dental.pkl`) y Uso en Vivo en la App Web

### 5.1. Exportación del Binario Pickle
En la Sección 6 del notebook (`02_Python/modulo_ia.ipynb`), el estimador óptimo `best_rf_model` se serializa en disco usando `joblib`:

```python
import joblib
joblib.dump(best_rf_model, 'modelo_rf_dental.pkl')
```

### 5.2. Carga en Memoria en el Backend (`02_Python/app_api.py`)
Al iniciar el servidor FastAPI (`uvicorn app_api:app --port 8000`), el backend carga `modelo_rf_dental.pkl` una sola vez en memoria RAM:

```python
MODEL_PATH = os.path.join(os.path.dirname(__file__), "modelo_rf_dental.pkl")
rf_model = joblib.load(MODEL_PATH) if os.path.exists(MODEL_PATH) else None
```

El modelo cargado (`rf_model`) interviene en **3 flujos en tiempo real** dentro de la aplicación web React (`06_WebApp`):

#### Flujo A: Inferencia en Vivo al Agendar o Simular (`POST /api/predecir-en-vivo`)
- **Dónde se usa en la Web**:
  - Módulo **Agendamiento & Citas IA** (`AppointmentsControlPage.tsx`): Mientras recepción selecciona un paciente, tratamiento, fecha de cita y switch de SMS, el velocímetro (*Asistente Predictivo No-Show*) consulta `/api/predecir-en-vivo`.
  - Módulo **Simulador Prescriptivo & Telemetría ETL** (`SimulatorEtlPage.tsx`): Permite simular escenarios críticos (ej. >15 días de espera sin SMS) y cuantificar cómo baja la probabilidad al adelantar la cita o activar el recordatorio SMS.
- **Cómo procesa la petición `app_api.py`**:
  1. Recibe `edad`, `genero`, `tratamientoCodigo`, `diasEspera`, `smsRecibido`, `fechaCita` e `idPaciente`.
  2. Si el paciente ya tiene citas históricas en `oltp.Citas`, combina su historial real con la nueva cita simulada para calcular exactamente las 9 variables que espera `rf_model.feature_names_in_`:
     `['Edad', 'Genero_Num', 'Promedio_Espera_Dias', 'Max_Espera_Dias', 'Ratio_SMS', 'Costo_Promedio', 'Costo_Maximo', 'Mes_Ultima_Cita', 'DiaSemana_Ultima_Cita']`.
  3. Ejecuta `rf_model.predict_proba(X_nuevo)[0, 1]` y devuelve al frontend la probabilidad en porcentaje (`0..100%`) y la categoría (`Riesgo Alto`, `Riesgo Medio`, `Riesgo Bajo`).

#### Flujo B: Sincronización ETL y Scoring de Nuevos Pacientes (`POST /api/sincronizar-datamart`)
- **Dónde se usa en la Web**: Botón **"Sincronizar con Data Mart"** en la cabecera general, en la vista de Citas o en el Monitor de Arquitectura Pipeline ETL.
- **Cómo procesa la petición `app_api.py`**:
  1. Ejecuta el procedimiento almacenado `EXEC dm.usp_ETL_CargarDataMart;` para poblar `dm.Dim_Paciente`, `dm.Dim_Tiempo` y `dm.Fact_Atenciones` con los nuevos pacientes y citas registrados en `oltp`.
  2. Identifica mediante `LEFT JOIN dm.Resultados_Prediccion_IA` a todos los pacientes nuevos en `dm.vw_Dataset_ML` que aún no tienen puntaje IA.
  3. Calcula sus 9 características agregadas, los evalúa con `rf_model.predict_proba()` e inserta sus predicciones en `dm.Resultados_Prediccion_IA`.

#### Flujo C: Bandeja de Retención y Re-Scoring por Write-Back SMS (`GET /api/retencion` y `POST /api/retencion/{id_cita}/confirmar-sms`)
- **Dónde se usa en la Web**: Módulo **Agenda Inteligente & Retención** (`RetentionMatrixPage.tsx`).
- **Cómo procesa la petición `app_api.py`**:
  1. `GET /api/retencion` consulta los pacientes priorizados de mayor a menor `Probabilidad_Abandono` en `dm.Resultados_Prediccion_IA` cruzados con su última atención en `dm.Fact_Atenciones`.
  2. Cuando el operador hace clic en **"Confirmar SMS"**, el endpoint `POST /api/retencion/{id_cita}/confirmar-sms` ejecuta un **Write-Back transaccional** (`UPDATE oltp.Citas SET SMSRecibido = 1` y `UPDATE dm.Fact_Atenciones SET SMSRecibido = 1`).
  3. Inmediatamente después, recalcula el nuevo `Ratio_SMS` del paciente en SQL Server, vuelve a invocar `rf_model.predict_proba()` y actualiza `Probabilidad_Abandono` y `Nivel_Riesgo` en `dm.Resultados_Prediccion_IA`, reflejando en pantalla la reducción real del riesgo.
