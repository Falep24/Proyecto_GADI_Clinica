# Reglas del Proyecto GADI (Contexto Permanente)

## 1. Arquitectura y Stack
- Base de datos: SQL Server (`SQLEXPRESS`) con scripts en `/01_SQL/`.
- Backend y ML: Python 3.11 (FastAPI) en `/02_Python/app_api.py`.
- Frontend: React + Vite (variables de entorno con prefijo `VITE_`).

## 2. Archivos Protegidos (NO MODIFICAR)
- `/02_Python/modelo_rf_dental.pkl` (modelo Random Forest ya entrenado).
- `/02_Python/modulo_ia.ipynb` y `/02_Python/integrar_datasets.py`.
- `/03_PowerBI/` (archivos `.pbix`).
- `/05_Datasets/` (no indexar ni modificar archivos CSV).

## 3. Reglas de Seguridad y Aprendizaje
- Nunca borrar datos ni ejecutar `DROP TABLE` en SQL Server.
- No hardcodear contraseñas; leer credenciales desde variables de entorno o configuración local.
- Como el objetivo es aprendizaje, explica la causa raíz de cada error encontrado antes de aplicar el parche.