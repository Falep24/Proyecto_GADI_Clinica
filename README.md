# SISTEMA INTELIGENTE DE PREDICCIÓN DE ABANDONO DE PACIENTES DENTALES

## DESCRIPCIÓN DEL PROYECTO:

Solución End-to-End de Inteligencia de Negocios y Machine Learning para
detectar, predecir y mitigar la tasa de abandono de tratamientos en clínicas
dentales, cuantificando la pérdida financiera y simulando escenarios de
recuperación económica.

## ARQUITECTURA DE LA SOLUCIÓN:

1. CAPA DE DATOS (SQL Server):
   - OLTP + Data Mart con arquitectura en Esquema Estrella (Star Schema).
   - Dimensiones: Dim_Paciente, Dim_Medico, Dim_Tratamiento, Dim_Tiempo.
   - Hechos: Fact_Atenciones.
   - Tabla Ingestada: Resultados_Prediccion_IA.

2. CAPA DE MACHINE LEARNING (Python):
   - Modelo de Clasificación (Random Forest) entrenado con Scikit-Learn.
   - Evaluación sobre un universo de 60000 pacientes.
   - Output: Probabilidad_Abandono y Nivel_Riesgo (Alto, Medio, Bajo).

3. CAPA DE ANALÍTICA Y DECISIONES (Power BI):
   - Módulo 1 (Ejecutivo): KPIs de gestión (Tasa Abandono 23.37%, Citas, Ingresos).
   - Módulo 2 (Predictivo IA): Distribución de riesgos y matriz de pacientes priorizados.
   - Módulo 3 (Simulador What-If): Parámetro numérico y DAX prescriptivo para
     estimación de retornos financieros (S/ 173 mil recuperables al 30%).

## INTEGRANTES DEL EQUIPO:

- Borromeo Quispe, Allimson Julissa
- Huere Marchan, Manfred
- Lozano Villalobos, Alex
- Pauca Muñoz, Fabrizzio Alejandro
- Pacheco Antón, Fátima de los Ángeles

## ESTRUCTURA DEL ENTREGABLE (.ZIP):

📁 Proyecto_GADI_Clinica/
│
├── 📁 01_SQL/
│ ├── 01_DDL_Creacion_Estructura.sql
│ ├── 02_Logica_Procesos_ETL.sql
│ └── 03_DML_Ejecucion_Cargas.sql
│
├── 📁 02_Python/
│ ├── modulo_ia.ipynb
│
├── 📁 03_PowerBI/
│ └── Dashboard_Prediccion_Abandono_Dental.pbix
│
├── 📁 04_Documentacion/
│ ├── Informe Final GADI 2026 — Sistema Inteligente de Gestión, Predicción y Fidelización de Pacientes para un Centro Dental.docx
│  
├── 📁 05_Datasets/
│ └── cpms_odontologia.csv
│ └── KaggleV2-May-2016.csv
│ └── mtsamples.csv
└── README.txt

## INSTRUCCIONES DE REVISIÓN:

1. Cargar scripts en SQL Server Management Studio para verificar las tablas y el Data Mart.
2. Abrir el archivo .pbix en Power BI Desktop e interactuar con los tres módulos del informe.
