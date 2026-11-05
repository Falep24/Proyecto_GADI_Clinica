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

    -- A. REGISTRO DE RECHAZOS
    TRUNCATE TABLE stg.Rechazos_Ingesta;
    
    INSERT INTO stg.Rechazos_Ingesta (PatientId, AppointmentID, Motivo)
    SELECT PatientId, AppointmentID, 'PatientId en notación científica o inválido'
    FROM stg.Raw_NoShow WHERE TRY_CAST(PatientId AS BIGINT) IS NULL;

    INSERT INTO stg.Rechazos_Ingesta (PatientId, AppointmentID, Motivo)
    SELECT PatientId, AppointmentID, 'Edad fuera de rango (0-100)'
    FROM stg.Raw_NoShow WHERE TRY_CAST(Age AS SMALLINT) NOT BETWEEN 0 AND 100;
    
    -- B. CARGA IDEMPOTENTE DE TRATAMIENTOS
    IF NOT EXISTS (SELECT 1 FROM oltp.Tratamientos)
    BEGIN
        WITH TratamientosRaw AS (
            SELECT 
                ROW_NUMBER() OVER(ORDER BY Codigo) AS IdTratamiento,
                Codigo, Descripcion, 
                ISNULL(TRY_CAST(REPLACE(Tarifa, ',', '.') AS DECIMAL(10,2)), 45.00) AS Costo
            FROM stg.Raw_CPMS WHERE Codigo IS NOT NULL
        )
        INSERT INTO oltp.Tratamientos (IdTratamiento, CodigoCPMS, Descripcion, Costo, DuracionMeses)
        SELECT IdTratamiento, Codigo, Descripcion, Costo, 1 FROM TratamientosRaw;

        IF NOT EXISTS (SELECT 1 FROM oltp.Tratamientos)
        BEGIN
            INSERT INTO oltp.Tratamientos (IdTratamiento, CodigoCPMS, Descripcion, Costo, DuracionMeses) VALUES
            (1, 'CPMS-01', 'Consulta Odontológica General', 30.00, 1),
            (2, 'CPMS-02', 'Profilaxis y Destartraje', 50.00, 1),
            (3, 'CPMS-03', 'Curación con Resina Fotocurable', 70.00, 1),
            (4, 'CPMS-04', 'Exodoncia Simple', 60.00, 1),
            (5, 'CPMS-05', 'Endodoncia Unirradicular', 150.00, 2),
            (6, 'CPMS-06', 'Ortodoncia - Control Mensual', 80.00, 12);
        END
    END;

    -- C. PACIENTES
    WITH PacientesUnicos AS (
        SELECT 
            TRY_CAST(PatientId AS BIGINT) AS IdPaciente,
            UPPER(LEFT(Gender, 1)) AS Genero,
            TRY_CAST(Age AS SMALLINT) AS Edad,
            Neighbourhood AS Barrio,
            ROW_NUMBER() OVER (PARTITION BY TRY_CAST(PatientId AS BIGINT) ORDER BY TRY_CAST(AppointmentID AS INT) DESC) AS FilaNum
        FROM stg.Raw_NoShow
        WHERE TRY_CAST(PatientId AS BIGINT) IS NOT NULL AND TRY_CAST(Age AS SMALLINT) BETWEEN 0 AND 100
    )
    INSERT INTO oltp.Pacientes (IdPaciente, Genero, Edad, Barrio)
    SELECT IdPaciente, Genero, Edad, Barrio
    FROM PacientesUnicos
    WHERE FilaNum = 1 AND NOT EXISTS (SELECT IdPaciente FROM oltp.Pacientes);

    -- D. CITAS 
    DECLARE @TotalTratamientos INT = (SELECT COUNT(*) FROM oltp.Tratamientos);

    WITH CitasValidas AS (
        SELECT 
            TRY_CAST(AppointmentID AS INT) AS IdCita,
            TRY_CAST(PatientId AS BIGINT) AS IdPaciente,
            (ABS(CHECKSUM(AppointmentID)) % 3) + 1 AS IdOdontologo,
            (ABS(CHECKSUM(AppointmentID, 7)) % ISNULL(NULLIF(@TotalTratamientos, 0), 1)) + 1 AS IdTratamientoCalc,
            TRY_CAST(LEFT(ScheduledDay, 19) AS DATETIME2) AS FechaProgramacion,
            TRY_CAST(LEFT(AppointmentDay, 10) AS DATE) AS FechaCita,
            CASE WHEN SMS_received = '1' THEN 1 ELSE 0 END AS SMSRecibido,
            NoShow,
            ROW_NUMBER() OVER (PARTITION BY TRY_CAST(AppointmentID AS INT) ORDER BY ScheduledDay DESC) AS FilaNum
        FROM stg.Raw_NoShow
        WHERE TRY_CAST(AppointmentID AS INT) IS NOT NULL 
          AND TRY_CAST(PatientId AS BIGINT) IS NOT NULL
          AND DATEDIFF(DAY, CAST(LEFT(ScheduledDay, 10) AS DATE), CAST(LEFT(AppointmentDay, 10) AS DATE)) >= 0
    )
    INSERT INTO oltp.Citas (IdCita, IdPaciente, IdOdontologo, IdTratamiento, FechaProgramacion, FechaCita, SMSRecibido, NoShow, CostoAplicado)
    SELECT 
        c.IdCita, c.IdPaciente, c.IdOdontologo, 
        ISNULL(t.IdTratamiento, 1) AS IdTratamiento, 
        c.FechaProgramacion, c.FechaCita, c.SMSRecibido, c.NoShow, 
        ISNULL(t.Costo, 45.00)
    FROM CitasValidas c
    LEFT JOIN oltp.Tratamientos t ON t.IdTratamiento = c.IdTratamientoCalc
    WHERE c.FilaNum = 1 AND c.IdCita NOT IN (SELECT IdCita FROM oltp.Citas) 
      AND c.IdPaciente IN (SELECT IdPaciente FROM oltp.Pacientes);
END;
GO

-- 2. PROCEDIMIENTO: CARGA DATA MART
CREATE OR ALTER PROCEDURE dm.usp_ETL_CargarDataMart
AS
BEGIN
    SET NOCOUNT ON;
    SET LANGUAGE Spanish;
    
    -- Pacientes
    INSERT INTO dm.Dim_Paciente (IdPaciente, Genero, Edad, Rango_Etario, Barrio)
    SELECT IdPaciente, Genero, Edad, 
           CASE 
               WHEN Edad BETWEEN 0 AND 17 THEN '0-17 años'
               WHEN Edad BETWEEN 18 AND 29 THEN '18-29 años'
               WHEN Edad BETWEEN 30 AND 44 THEN '30-44 años'
               WHEN Edad BETWEEN 45 AND 59 THEN '45-59 años'
               ELSE '60 años a más'
           END AS Rango_Etario,
           Barrio
    FROM oltp.Pacientes 
    WHERE IdPaciente NOT IN (SELECT IdPaciente FROM dm.Dim_Paciente);
    
    -- Médicos
    INSERT INTO dm.Dim_Medico (IdOdontologo, NombreCompleto, Especialidad)
    SELECT IdOdontologo, Nombres + ' ' + Apellidos, Especialidad 
    FROM oltp.Odontologos 
    WHERE IdOdontologo NOT IN (SELECT IdOdontologo FROM dm.Dim_Medico);

    -- Tratamientos
    INSERT INTO dm.Dim_Tratamiento (IdTratamiento, Descripcion, Duracion_Meses, Costo_Total)
    SELECT IdTratamiento, Descripcion, DuracionMeses, Costo 
    FROM oltp.Tratamientos 
    WHERE IdTratamiento NOT IN (SELECT IdTratamiento FROM dm.Dim_Tratamiento);

    -- Tiempo
    INSERT INTO dm.Dim_Tiempo (SK_Tiempo, Fecha, Anio, Mes, NombreMes, Trimestre, Dia_Semana)
    SELECT DISTINCT 
        CAST(CONVERT(VARCHAR(8), FechaCita, 112) AS INT), 
        FechaCita, YEAR(FechaCita), MONTH(FechaCita), 
        DATENAME(MONTH, FechaCita), DATEPART(QUARTER, FechaCita), DATENAME(WEEKDAY, FechaCita)
    FROM oltp.Citas 
    WHERE CAST(CONVERT(VARCHAR(8), FechaCita, 112) AS INT) NOT IN (SELECT SK_Tiempo FROM dm.Dim_Tiempo);

    -- Hechos
    INSERT INTO dm.Fact_Atenciones (
        IdCita, SK_Paciente, SK_Medico, SK_Tratamiento, SK_Tiempo, 
        Estado_Cita, Tiempo_Espera_Dias, SMSRecibido, Monto_Pagado, Es_Atendido, Es_Ausencia
    )
    SELECT 
        c.IdCita, 
        dp.SK_Paciente, 
        dmed.SK_Medico, 
        dt.SK_Tratamiento, 
        CAST(CONVERT(VARCHAR(8), c.FechaCita, 112) AS INT) AS SK_Tiempo,
        CASE WHEN c.NoShow = 'Yes' THEN 'Ausencia/No-Show' ELSE 'Atendido' END,
        DATEDIFF(DAY, CAST(c.FechaProgramacion AS DATE), c.FechaCita) AS Tiempo_Espera_Dias, 
        c.SMSRecibido,
        CASE WHEN c.NoShow = 'Yes' THEN 0 ELSE c.CostoAplicado END AS Monto_Pagado, 
        CASE WHEN c.NoShow = 'Yes' THEN 0 ELSE 1 END,
        CASE WHEN c.NoShow = 'Yes' THEN 1 ELSE 0 END
    FROM oltp.Citas c
    JOIN dm.Dim_Paciente dp ON c.IdPaciente = dp.IdPaciente
    JOIN dm.Dim_Medico dmed ON c.IdOdontologo = dmed.IdOdontologo
    -- ¡AQUÍ ESTÁ LA CORRECCIÓN CLAVE!
    JOIN dm.Dim_Tratamiento dt ON c.IdTratamiento = dt.IdTratamiento 
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

-- 4. NUEVO DATASET PARA MACHINE LEARNING 
CREATE OR ALTER VIEW dm.vw_Dataset_ML AS
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
JOIN dm.Dim_Tiempo time ON f.SK_Tiempo = time.SK_Tiempo;
GO