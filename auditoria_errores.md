Voy a conectar el repositorio a la sesión y revisar el código buscando fallas, tanto de funcionamiento como de seguridad.

Voy a clonar el repositorio, revisar su estructura y analizar el código con mentalidad de atacante para armarte la lista de fallas.

Ya leí el backend, el SQL y el contexto del frontend. Ahora reviso el notebook, el CSV consolidado, los tipos y las páginas restantes para confirmar los hallazgos.

Voy con las verificaciones reales: compilar la webapp, probar el backend con una base simulada, auditar los datos del ETL e inspeccionar el modelo `.pkl` sin ejecutarlo.

Hallazgo importante: `npm install` falla con un conflicto de dependencias. Reviso el detalle y pruebo si compila con el workaround, mientras monto el backend con una base simulada.

El frontend sí compila (con el workaround). Ahora pruebo el backend "atacándolo" con una base simulada, y verifico si `npm ci` funciona y qué reporta `npm audit`.

El script de ataque falló por el aislamiento de Python (`-I`), no por tu código. Lo reejecuto y detallo los errores de `npm ci` y `npm audit`.

Fue una limitación de mi base simulada (devuelve `None` para los KPIs), no un bug tuyo. Ajusto la prueba CORS a un endpoint sin BD y reejecuto.

Mi base simulada tampoco soporta `pd.read_sql`. Sustituyo esa prueba por una verificación estática de rutas sin dependencias de seguridad.

Con las pruebas ya tengo evidencia concreta. Me faltan dos verificaciones rápidas: el control de "roles" del frontend y las dependencias sin uso.

Ya tengo evidencia suficiente. Cierro las tareas de revisión y dejo registrado el repositorio del proyecto en mi contexto antes de entregarte la lista.

Revisé todo el repositorio (SQL, API FastAPI, notebook, webapp React y datasets) y encontré 26 fallas. No tengo SQL Server, así que lo de T-SQL sale de leer el código y de auditar los CSV. El backend lo ataqué con una base simulada (lo que marco como "reproducido"). La webapp la instalé, tipé y compilé.

Lo que está bien: no hay credenciales en el repo, todas las consultas van parametrizadas (probé payloads de inyección en `buscar` y `riesgo` y no pasan), y el `.pkl` solo referencia sklearn y numpy.

## Críticos

1. **API sin autenticación y con CORS abierto** (`app_api.py` L15-21, 18 rutas `/api/*` sin protección). Reproducido: un preflight `DELETE` desde `http://evil.example` devuelve ese origen reflejado más `allow-credentials: true`, y `DELETE /api/pacientes/47812903` sin credenciales ejecuta el borrado y responde 200. Cualquier web que abra alguien del equipo puede leer o borrar datos clínicos. Corrección: auth con `Depends` (API key o JWT), `allow_origins` solo del front, sin comodín con credenciales y servir en `127.0.0.1`. El selector "Dirección/Recepción" de `AppShell.tsx` es solo un botón, no un control de acceso.

2. **El frontend dice "guardado" cuando la BD rechazó la operación.** `api.ts` L79-88 reemplaza `"HTTP 400"` por el texto de `detail`, así que el chequeo `msg.startsWith('HTTP 4')` de `ClinicalContext.tsx` L341 y L409 nunca se cumple. Los errores de validación y FK caen al "modo offline", el paciente aparece creado o eliminado y sale el toast de éxito. `addOltpAppointment`, `updatePatient` y el resto tragan cualquier error. Corrección: lanzar un `ApiError` con `status`, usar el fallback solo en error de red o 5xx y mostrar el error real en 4xx.

3. **Las citas "Pendiente" cuentan como atendidas y cobradas.** En `02_Logica_Procesos_ETL.sql` L150-155 solo `'Yes'` es ausencia y todo lo demás es "Atendido" con `Monto_Pagado = CostoAplicado`. Pasa igual en `app_api.py` L589-591 y L621-623. Reproducido: `PUT /estado` con "Pendiente" deja `Es_Atendido=1`. Infla asistencia, "ingresos recuperados" y el target del modelo. Corrección: `'Pen'` como estado propio (`Es_Atendido=0`, `Es_Ausencia=0`, `Monto_Pagado=0`) y fuera del dataset de ML.

4. **"Confirmar SMS / Twilio / WhatsApp" no envía nada pero escribe `SMSRecibido=1`** (`RetentionMatrixPage.tsx` L85-115, el SID es aleatorio; `app_api.py` L843-888). Contamina una variable del modelo y de los KPI. Además baja la probabilidad con un `-0.18` fijo (L868) en vez de recalcularla, y lo escribe en `dm.Resultados_Prediccion_IA`, que el notebook luego trunca. Corrección: tabla de notificaciones con estado real, o rotularlo como demo sin escribir en OLTP/DM.

5. **El nombre y el teléfono del paciente no se guardan.** `oltp.Pacientes` no tiene esas columnas; la API los guarda en un dict en memoria (L46, L271-275, L310-314) y se pierden al reiniciar. Para los ~93 mil pacientes importados la UI muestra "Paciente HC-xxxxxx" y un teléfono inventado desde el ID (L59-71; reproducido: 29872499824296 → "+51 9998 242 96"). El flujo de retención "envía" a esos números. Corrección: columnas reales en el DDL y quitar los valores fabricados.

## Altos

6. **`npm install` y `npm ci` fallan (ERESOLVE).** `esbuild ^0.25` en `package.json` choca con el peer `^0.27 || ^0.28` de vite 8. Con `--legacy-peer-deps` instala, y `tsc --noEmit` y `vite build` pasan. Corrección: subir o quitar `esbuild` y dejar un solo lockfile (hay `bun.lock` y `package-lock.json`). Mueve vite, tailwind y plugin-react a `devDependencies`. Quita `express`, `dotenv`, `@google/genai`, `motion`, `lucide-react`, `tsx` y `autoprefixer`, que no se usan. `npm audit` da 5 high (ReDoS de `picomatch` vía vite/tinyglobby, solo herramienta de build).

7. **La UI solo ve 100 de ~93 mil pacientes y 210 mil citas.** `api.ts` L108, L130 y L173 llaman sin parámetros y el backend limita a 100. `buscar` nunca se usa, así que la búsqueda y la paginación operan sobre esas 100 filas, igual que el selector de pacientes al agendar. Además `limit` no tiene tope (reproducido `TOP(2000000000)`, L155, L353, L741). Corrección: paginación y búsqueda en servidor, y `Query(ge=1, le=500)`.

8. **"Hoy" está fijado en 2024-11-12** (`ClinicalContext.tsx` L449 y L583; `AppointmentsControlPage.tsx` L32, L63, L410; `SimulatorEtlPage.tsx` L161). Una cita de esta semana calcula ~738 días de espera y se la manda al modelo. El valor por defecto (2024-11-30) ya es pasado y la API lo guarda (L516-517) antes de `FechaProgramacion`. `dm.usp_ETL_CargarDataMart` no filtra negativos, así que queda `Tiempo_Espera_Dias` negativo en el Fact. Corrección: `new Date()`, validar en la API y un `CHECK (FechaCita >= CAST(FechaProgramacion AS DATE))`.

9. **"Guardar Cita" del simulador ignora el formulario** (`SimulatorEtlPage.tsx` L155-163): siempre usa `patients[0]`, odontólogo 2 y fecha `2024-11-30`.

10. **El catálogo de tratamientos no coincide con la BD.** El front usa `CPMS-8901/8904/8922/8930`, que no existen (la BD tiene 12 códigos `D####`). El `code_map` de `app_api.py` L463-474 está pensado para los 6 registros de respaldo. Reproducido: "Endodoncia Molar" se guarda como D2330 (resina), "Ortodoncia" como D2391, "Implante" como D2330 y "Restauración Resina" como D1120 (profilaxis niño). Además cae a `return 1` en silencio (L477) y `/api/retencion` fabrica `CPMS-0{id}` (L815). Corrección: un `GET /api/tratamientos` desde `oltp.Tratamientos` como única fuente y 400 si el código no existe.

11. **La bandeja de retención no lista lo que debería.** En `app_api.py` L769 la predicción es por paciente pero se une por cita, así que un paciente se repite N veces. No hay filtro de estado ni fecha, y lista citas históricas (2016) en vez de las pendientes. Las horas (L821) y los filtros Hoy/Mañana/Semana (L408, `idx % 3`) son inventados, y `FechaCita` es solo DATE. Corrección: filtrar pendientes con `FechaCita >= hoy` y calcular el bucket por fecha.

12. **El ETL OLTP solo funciona en la primera carga** (`02_Logica_Procesos_ETL.sql` L63). `NOT EXISTS (SELECT IdPaciente FROM oltp.Pacientes)` no está correlacionado, así que solo es verdadero con la tabla vacía. En cargas posteriores (incluido `/api/etl/cargar-oltp`) no entra ningún paciente nuevo y sus citas se descartan en L93. Corrección: correlacionar por `IdPaciente` o usar `MERGE`. Además el rechazo de edades (L22) ignora NULL, y las fechas invertidas o AppointmentID duplicados se descartan sin registrarse en `Rechazos_Ingesta`. En los CSV hay 33 edades fuera de rango, 30 PatientId en notación científica, 5 fechas invertidas y 1 AppointmentID repetido entre fuentes.

13. **El Data Mart nunca se actualiza.** Solo inserta lo nuevo (L116, L161). Editar un paciente o reprogramar una cita (L640-652 solo toca `oltp.Citas`) deja `Dim_Paciente` y el Fact desactualizados.

14. **El modelo se entrena de una forma y se usa de otra.**
    - Se entrena por paciente con agregados, pero `/api/predecir-en-vivo` lo usa por cita con Max=Promedio y `Ratio_SMS` 0/1 (L709-719).
    - El notebook usa `last` para Edad, Mes y Día, mientras `sincronizar` usa `MAX` (L1001-1009).
    - El mes y el día de semana son los de hoy, no los de la cita (L705-706).
    - `DiaSemana` depende de `DATEFIRST`: la API asume domingo=1, la vista usa la sesión y el ETL fuerza español (lunes=1). Verifica con `SELECT @@DATEFIRST`.
    - El notebook afirma "CERO Data Leakage", pero eso no está demostrado: los agregados incluyen la misma última cita que define el target (42,308 de 92,928 pacientes tienen una sola cita).
    - Odontólogo, tratamiento y costo se asignan pseudoaleatoriamente con `CHECKSUM` (L72-73), así que `Costo_*` es ruido.
    - Kaggle son citas médicas de Brasil 2016 mezcladas con datos sintéticos de Lima. Es un riesgo de validez si te lo cuestionan.

15. **Métricas y telemetría inventadas.** `/api/ml/reentrenar` (L1083-1091) no reentrena y devuelve un AUC fijo, y la UI anuncia "RandomForest_v2.pkl actualizado" (`ClinicalContext.tsx` L779-801). El AUC aparece como 0.842, 0.834 y 0.892 según la pantalla. La pestaña "Power BI" es un dibujo con constantes (`DEFAULT_PBI_URL` tiene un GUID inválido). La UI también muestra CHECK de edad, triggers de auditoría, índices `IX_Pacientes_*`, RLS y CDC que no existen en el DDL. Corrección: métricas reales guardadas desde el notebook, o rotular como demo.

16. **Hay tres umbrales de riesgo distintos.** Notebook y API usan Alto ≥ 0.50 y Medio ≥ 0.35. Retención usa 50/25 (L8-12), Citas 45/25 (L122) y Simulador 65/35 (L97-103). Un 30% es "Bajo" en Power BI y "Medio" en la web. Corrección: usar el `Nivel_Riesgo` que ya devuelve la API.

17. **Los filtros de KPI no hacen nada.** `/api/kpis-monitor` ignora `period` y `sede` (L894), `ultimoSync` es la hora actual y no la del último ETL (L973), y `eficienciaSillon = 100 - tasa` (L949).

## Medios

18. **Validación débil en PUT/DELETE/PATCH.**
    - Un `PUT /pacientes` parcial sobrescribe con F/30/"Lima" (L298-300).
    - Responde `citasCount: 0` y `ultimaCita: "Actualizado"`, y el front reemplaza la fila con eso (`ClinicalContext.tsx` L363).
    - No valida género ni rango (reproducido: `'Z'` y `32000` llegan a SQL).
    - Los IDs inexistentes devuelven 200 porque no se revisa `rowcount`.
    - `eliminar_paciente` convierte cualquier error en "tiene citas asociadas" (L340-345).

19. **Parser de IDs difuso** (`_parse_numeric_id`, L48-57). Reproducido: `abc47812903xyz` → 47812903, `12-34` → 34, `CT-2024-1104` → 1104. Un ID local del fallback del front puede modificar otro registro. Usa `int` tipado en la ruta.

20. **Fuga de información en errores.** `detail=str(e)` (L291, L574) devuelve nombres de constraints y del driver.

21. **Condición de carrera en `IdCita`.** `MAX(IdCita)+1` (L489) duplica IDs con concurrencia. Usa `SEQUENCE`.

22. **Inyección de fórmulas en el CSV** (`PatientsCrudPage.tsx` L170-186). Un nombre como `=HYPERLINK(...)` se ejecuta al abrir el export en Excel. Tampoco escapa comillas ni agrega BOM.

23. **Rutas absolutas de tu PC** en `03_DML_Ejecucion_Cargas.sql` L17 y L21 e `integrar_datasets.py` L4-5 (`C:\Users\fabri\Downloads\...`). Además `BULK INSERT` suele fallar con "Access denied" porque la cuenta de servicio de SQL Server no lee esa carpeta. Usa `:setvar` y `Path(__file__)`.

24. **Reproducibilidad.**
    - No hay `requirements.txt` (el `.pkl` es de scikit-learn 1.8.0 y `joblib.load` en L42 no está protegido).
    - `Trusted_Connection=yes` solo sirve en Windows, y `drivers[-1]` elige un driver arbitrario (L32).
    - El README no explica cómo levantar la API ni la webapp.
    - El README dice "60000 pacientes" (el CSV tiene ~92.9 mil únicos) y lista `mtsamples.csv`, que ningún script usa.

25. **Higiene del repo.**
    - Hay un `__pycache__/*.pyc` commiteado con tu ruta local.
    - No hay `.gitignore` en la raíz.
    - El `package-lock.json` raíz está vacío.
    - ~57 MB de CSV y `.pbix` viven en git.
    - 5 HTML de `public/assets/aistudio/` cargan `cdn.tailwindcss.com` sin SRI.
    - `LOGO_URL` apunta a googleusercontent.

26. **DDL destructivo y sin restricciones.** `01_DDL` L8-13 hace `DROP DATABASE` sin guarda y faltan `CHECK` de Edad, Género y NoShow. Varios endpoints no cierran la conexión en `finally`.