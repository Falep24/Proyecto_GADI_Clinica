/* =====================================================================
   SCRIPT 2: LÓGICA DE PROCESAMIENTO (STORED PROCEDURES Y VISTAS)
   ===================================================================== */
USE DentalCenterDB;
GO

-- 1. PROCEDIMIENTO: CARGA OLTP
CREATE OR ALTER PROCEDURE stg.usp_CargarOLTP
AS
BEGIN
    SET NOCOUNT ON;
    
    -- Tratamientos
    INSERT INTO oltp.Tratamientos (CodigoCPMS, Descripcion, Costo, DuracionMeses)
    SELECT Codigo, Descripcion, ISNULL(TRY_CAST(REPLACE(Tarifa, ',', '.') AS DECIMAL(10,2)), 45.00), 1
    FROM stg.Raw_CPMS WHERE Codigo IS NOT NULL;

    IF NOT EXISTS (SELECT 1 FROM oltp.Tratamientos)
    BEGIN
        INSERT INTO oltp.Tratamientos (CodigoCPMS, Descripcion, Costo, DuracionMeses) VALUES
        ('CPMS-01', 'Consulta Odontológica General', 30.00, 1),
        ('CPMS-02', 'Profilaxis y Destartraje', 50.00, 1),
        ('CPMS-03', 'Curación con Resina Fotocurable', 70.00, 1),
        ('CPMS-04', 'Exodoncia Simple', 60.00, 1),
        ('CPMS-05', 'Endodoncia Unirradicular', 150.00, 2),
        ('CPMS-06', 'Ortodoncia - Control Mensual', 80.00, 12);
    END;

    -- Pacientes
    WITH PacientesUnicos AS (
        SELECT 
            TRY_CAST(PatientId AS BIGINT) AS IdPaciente,
            UPPER(LEFT(Gender, 1)) AS Genero,
            TRY_CAST(Age AS SMALLINT) AS Edad,
            Neighbourhood AS Barrio,
            TRY_CAST(Scholarship AS BIT) AS Beca,
            TRY_CAST(Hipertension AS BIT) AS Hipertension,
            TRY_CAST(Diabetes AS BIT) AS Diabetes,
            TRY_CAST(Alcoholism AS BIT) AS Alcoholismo,
            TRY_CAST(Handcap AS TINYINT) AS Discapacidad,
            ROW_NUMBER() OVER (PARTITION BY TRY_CAST(PatientId AS BIGINT) ORDER BY TRY_CAST(AppointmentID AS INT) DESC) AS FilaNum
        FROM stg.Raw_NoShow
        WHERE TRY_CAST(PatientId AS BIGINT) IS NOT NULL AND TRY_CAST(Age AS SMALLINT) BETWEEN 0 AND 120
    )
    INSERT INTO oltp.Pacientes (IdPaciente, Genero, Edad, Barrio, Beca, Hipertension, Diabetes, Alcoholismo, Discapacidad)
    SELECT IdPaciente, Genero, Edad, Barrio, ISNULL(Beca, 0), ISNULL(Hipertension, 0), ISNULL(Diabetes, 0), ISNULL(Alcoholismo, 0), ISNULL(Discapacidad, 0)
    FROM PacientesUnicos
    WHERE FilaNum = 1 AND IdPaciente NOT IN (SELECT IdPaciente FROM oltp.Pacientes);

    -- Citas
    WITH CitasUnicas AS (
        SELECT 
            TRY_CAST(AppointmentID AS INT) AS IdCita,
            TRY_CAST(PatientId AS BIGINT) AS IdPaciente,
            (ABS(CHECKSUM(AppointmentID)) % 3) + 1 AS IdOdontologo,
            (ABS(CHECKSUM(AppointmentID, 7)) % (SELECT ISNULL(NULLIF(COUNT(*), 0), 1) FROM oltp.Tratamientos)) + 1 AS IdTratamiento,
            TRY_CAST(LEFT(ScheduledDay, 19) AS DATETIME2) AS FechaProgramacion,
            TRY_CAST(LEFT(AppointmentDay, 10) AS DATE) AS FechaCita,
            CASE WHEN SMS_received = '1' THEN 1 ELSE 0 END AS SMSRecibido,
            NoShow,
            ROW_NUMBER() OVER (PARTITION BY TRY_CAST(AppointmentID AS INT) ORDER BY ScheduledDay DESC) AS FilaNum
        FROM stg.Raw_NoShow
        WHERE TRY_CAST(AppointmentID AS INT) IS NOT NULL AND TRY_CAST(PatientId AS BIGINT) IS NOT NULL
    )
    INSERT INTO oltp.Citas (IdCita, IdPaciente, IdOdontologo, IdTratamiento, FechaProgramacion, FechaCita, SMSRecibido, NoShow, CostoAplicado)
    SELECT c.IdCita, c.IdPaciente, c.IdOdontologo, c.IdTratamiento, c.FechaProgramacion, c.FechaCita, c.SMSRecibido, c.NoShow, ISNULL(t.Costo, 50.00)
    FROM CitasUnicas c
    LEFT JOIN oltp.Tratamientos t ON t.IdTratamiento = c.IdTratamiento
    WHERE c.FilaNum = 1 AND c.IdCita NOT IN (SELECT IdCita FROM oltp.Citas) AND c.IdPaciente IN (SELECT IdPaciente FROM oltp.Pacientes);
END;
GO

-- 2. PROCEDIMIENTO: CARGA DATA MART
CREATE OR ALTER PROCEDURE dm.usp_ETL_CargarDataMart
AS
BEGIN
    SET NOCOUNT ON;
    SET LANGUAGE Spanish; -- Para extraer días/meses en español
    
    INSERT INTO dm.Dim_Paciente (IdPaciente, Genero, Edad, Barrio)
    SELECT IdPaciente, Genero, Edad, Barrio FROM oltp.Pacientes WHERE IdPaciente NOT IN (SELECT IdPaciente FROM dm.Dim_Paciente);
    
    INSERT INTO dm.Dim_Medico (IdOdontologo, NombreCompleto, Especialidad)
    SELECT IdOdontologo, Nombres + ' ' + Apellidos, Especialidad FROM oltp.Odontologos WHERE IdOdontologo NOT IN (SELECT IdOdontologo FROM dm.Dim_Medico);

    -- Dim_Tratamiento actualizada
    INSERT INTO dm.Dim_Tratamiento (IdTratamiento, Descripcion, Duracion_Meses, Costo_Total)
    SELECT IdTratamiento, Descripcion, DuracionMeses, Costo 
    FROM oltp.Tratamientos 
    WHERE IdTratamiento NOT IN (SELECT IdTratamiento FROM dm.Dim_Tratamiento);

    -- Dim_Tiempo actualizada
    INSERT INTO dm.Dim_Tiempo (SK_Tiempo, Fecha, Anio, Mes, NombreMes, Trimestre, Dia_Semana)
    SELECT DISTINCT 
        CAST(CONVERT(VARCHAR(8), FechaCita, 112) AS INT), 
        FechaCita, 
        YEAR(FechaCita), 
        MONTH(FechaCita), 
        DATENAME(MONTH, FechaCita),
        DATEPART(QUARTER, FechaCita),
        DATENAME(WEEKDAY, FechaCita)
    FROM oltp.Citas 
    WHERE CAST(CONVERT(VARCHAR(8), FechaCita, 112) AS INT) NOT IN (SELECT SK_Tiempo FROM dm.Dim_Tiempo);

    -- Fact_Atenciones actualizada
    INSERT INTO dm.Fact_Atenciones (
        IdCita, SK_Paciente, SK_Medico, SK_Tratamiento, SK_Tiempo, 
        Estado_Cita, Tiempo_Espera_Min, Monto_Pagado, Es_Atendido, Es_Ausencia
    )
    SELECT 
        c.IdCita, 
        dp.SK_Paciente, 
        dm.SK_Medico, 
        ISNULL(dt.SK_Tratamiento, 1), 
        CAST(CONVERT(VARCHAR(8), c.FechaCita, 112) AS INT) AS SK_Tiempo,
        CASE WHEN c.NoShow = 'Yes' THEN 'Ausencia/No-Show' ELSE 'Atendido' END AS Estado_Cita,
        DATEDIFF(MINUTE, c.FechaProgramacion, CAST(c.FechaCita AS DATETIME2)) AS Tiempo_Espera_Min, 
        c.CostoAplicado AS Monto_Pagado,
        CASE WHEN c.NoShow = 'Yes' THEN 0 ELSE 1 END AS Es_Atendido,
        CASE WHEN c.NoShow = 'Yes' THEN 1 ELSE 0 END AS Es_Ausencia
    FROM oltp.Citas c
    JOIN dm.Dim_Paciente dp ON c.IdPaciente = dp.IdPaciente
    JOIN dm.Dim_Medico dm ON c.IdOdontologo = dm.IdOdontologo
    LEFT JOIN dm.Dim_Tratamiento dt ON c.IdTratamiento = dt.IdTratamiento
    WHERE c.IdCita NOT IN (SELECT IdCita FROM dm.Fact_Atenciones);
END;
GO

-- 3. VISTAS ANALÍTICAS ACTUALIZADAS
CREATE OR ALTER VIEW dm.vw_KPI_TasaAbandono AS
SELECT 
    t.Anio, t.Mes, t.NombreMes, p.Barrio, 
    COUNT(*) AS TotalCitas, 
    SUM(f.Es_Ausencia) AS CitasAbandonadas,
    CAST(SUM(f.Es_Ausencia) * 100.0 / NULLIF(COUNT(*), 0) AS DECIMAL(5,2)) AS PorcentajeAbandono
FROM dm.Fact_Atenciones f 
JOIN dm.Dim_Tiempo t ON t.SK_Tiempo = f.SK_Tiempo 
JOIN dm.Dim_Paciente p ON p.SK_Paciente = f.SK_Paciente
GROUP BY t.Anio, t.Mes, t.NombreMes, p.Barrio;
GO

CREATE OR ALTER VIEW dm.vw_KPI_IngresosEnRiesgo AS
SELECT 
    t.Anio, t.NombreMes, m.Especialidad, 
    SUM(f.Monto_Pagado) AS IngresoTotalEstimado,
    SUM(CASE WHEN f.Es_Ausencia = 1 THEN f.Monto_Pagado ELSE 0 END) AS IngresosEnRiesgoPerdidos
FROM dm.Fact_Atenciones f 
JOIN dm.Dim_Tiempo t ON t.SK_Tiempo = f.SK_Tiempo 
JOIN dm.Dim_Medico m ON m.SK_Medico = f.SK_Medico
GROUP BY t.Anio, t.NombreMes, m.Especialidad;
GO

CREATE OR ALTER VIEW dm.vw_Dataset_ML AS
SELECT 
    p.SK_Paciente, p.Edad, p.Genero, p.Barrio,
    COUNT(f.ID_Hecho) AS Total_Citas, 
    SUM(f.Es_Ausencia) AS Total_Ausencias,
    AVG(f.Tiempo_Espera_Min) AS Prom_Tiempo_Espera,
    SUM(f.Monto_Pagado) AS Total_Pagado,
    MAX(t.Costo_Total) AS Costo_Tratamiento,
    CASE 
        WHEN (CAST(SUM(f.Es_Ausencia) AS FLOAT) / NULLIF(COUNT(f.ID_Hecho), 0)) >= 0.25 THEN 1
        ELSE 0 
    END AS Target_Abandono
FROM dm.Dim_Paciente p
JOIN dm.Fact_Atenciones f ON p.SK_Paciente = f.SK_Paciente
JOIN dm.Dim_Tratamiento t ON f.SK_Tratamiento = t.SK_Tratamiento
GROUP BY p.SK_Paciente, p.Edad, p.Genero, p.Barrio
GO

