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
    SELECT PatientId, AppointmentID, 'Edad nula o fuera de rango (0-100)'
    FROM stg.Raw_NoShow
    WHERE TRY_CAST(PatientId AS BIGINT) IS NOT NULL
      AND (TRY_CAST(Age AS SMALLINT) IS NULL OR TRY_CAST(Age AS SMALLINT) NOT BETWEEN 0 AND 100);

    INSERT INTO stg.Rechazos_Ingesta (PatientId, AppointmentID, Motivo)
    SELECT PatientId, AppointmentID, 'FechaCita anterior a FechaProgramacion (espera negativa)'
    FROM stg.Raw_NoShow
    WHERE TRY_CAST(PatientId AS BIGINT) IS NOT NULL
      AND TRY_CAST(AppointmentID AS INT) IS NOT NULL
      AND TRY_CAST(LEFT(ScheduledDay, 10) AS DATE) IS NOT NULL
      AND TRY_CAST(LEFT(AppointmentDay, 10) AS DATE) IS NOT NULL
      AND DATEDIFF(DAY, CAST(LEFT(ScheduledDay, 10) AS DATE), CAST(LEFT(AppointmentDay, 10) AS DATE)) < 0;
    
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

    -- C. PACIENTES (correlacionado por IdPaciente para soportar cargas incrementales)
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
    SELECT pu.IdPaciente, pu.Genero, pu.Edad, pu.Barrio
    FROM PacientesUnicos pu
    WHERE pu.FilaNum = 1
      AND NOT EXISTS (SELECT 1 FROM oltp.Pacientes p WHERE p.IdPaciente = pu.IdPaciente);

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
    WHERE c.FilaNum = 1
      AND NOT EXISTS (SELECT 1 FROM oltp.Citas oc WHERE oc.IdCita = c.IdCita)
      AND EXISTS (SELECT 1 FROM oltp.Pacientes op WHERE op.IdPaciente = c.IdPaciente);
END;
GO

-- 2. PROCEDIMIENTO: CARGA DATA MART
CREATE OR ALTER PROCEDURE dm.usp_ETL_CargarDataMart
AS
BEGIN
    SET NOCOUNT ON;
    SET LANGUAGE Spanish;
    
    -- A. Pacientes: Actualizar existentes e insertar nuevos
    UPDATE dp
    SET dp.Genero = p.Genero,
        dp.Edad = p.Edad,
        dp.Rango_Etario = CASE 
            WHEN p.Edad BETWEEN 0 AND 17 THEN '0-17 años'
            WHEN p.Edad BETWEEN 18 AND 29 THEN '18-29 años'
            WHEN p.Edad BETWEEN 30 AND 44 THEN '30-44 años'
            WHEN p.Edad BETWEEN 45 AND 59 THEN '45-59 años'
            ELSE '60 años a más'
        END,
        dp.Barrio = p.Barrio
    FROM dm.Dim_Paciente dp
    JOIN oltp.Pacientes p ON dp.IdPaciente = p.IdPaciente
    WHERE dp.Genero <> p.Genero OR dp.Edad <> p.Edad OR dp.Barrio <> p.Barrio;

    INSERT INTO dm.Dim_Paciente (IdPaciente, Genero, Edad, Rango_Etario, Barrio)
    SELECT p.IdPaciente, p.Genero, p.Edad, 
           CASE 
               WHEN p.Edad BETWEEN 0 AND 17 THEN '0-17 años'
               WHEN p.Edad BETWEEN 18 AND 29 THEN '18-29 años'
               WHEN p.Edad BETWEEN 30 AND 44 THEN '30-44 años'
               WHEN p.Edad BETWEEN 45 AND 59 THEN '45-59 años'
               ELSE '60 años a más'
           END AS Rango_Etario,
           p.Barrio
    FROM oltp.Pacientes p
    WHERE NOT EXISTS (SELECT 1 FROM dm.Dim_Paciente dp WHERE dp.IdPaciente = p.IdPaciente);
    
    -- B. Médicos
    INSERT INTO dm.Dim_Medico (IdOdontologo, NombreCompleto, Especialidad)
    SELECT o.IdOdontologo, o.Nombres + ' ' + o.Apellidos, o.Especialidad 
    FROM oltp.Odontologos o
    WHERE NOT EXISTS (SELECT 1 FROM dm.Dim_Medico dm WHERE dm.IdOdontologo = o.IdOdontologo);

    -- C. Tratamientos
    INSERT INTO dm.Dim_Tratamiento (IdTratamiento, Descripcion, Duracion_Meses, Costo_Total)
    SELECT t.IdTratamiento, t.Descripcion, t.DuracionMeses, t.Costo 
    FROM oltp.Tratamientos t
    WHERE NOT EXISTS (SELECT 1 FROM dm.Dim_Tratamiento dt WHERE dt.IdTratamiento = t.IdTratamiento);

    -- D. Tiempo
    INSERT INTO dm.Dim_Tiempo (SK_Tiempo, Fecha, Anio, Mes, NombreMes, Trimestre, Dia_Semana)
    SELECT DISTINCT 
        CAST(CONVERT(VARCHAR(8), c.FechaCita, 112) AS INT) AS SK_Tiempo, 
        c.FechaCita, YEAR(c.FechaCita), MONTH(c.FechaCita), 
        DATENAME(MONTH, c.FechaCita), DATEPART(QUARTER, c.FechaCita), DATENAME(WEEKDAY, c.FechaCita)
    FROM oltp.Citas c
    WHERE NOT EXISTS (
        SELECT 1 FROM dm.Dim_Tiempo dt 
        WHERE dt.SK_Tiempo = CAST(CONVERT(VARCHAR(8), c.FechaCita, 112) AS INT)
    );

    -- E. Hechos: Sincronizar actualizaciones de citas existentes y cargar nuevas
    UPDATE fa
    SET fa.SK_Tiempo = CAST(CONVERT(VARCHAR(8), c.FechaCita, 112) AS INT),
        fa.Estado_Cita = CASE 
            WHEN c.NoShow = 'Yes' THEN 'Ausencia/No-Show'
            WHEN c.NoShow = 'Pen' THEN 'Pendiente'
            ELSE 'Atendido'
        END,
        fa.Tiempo_Espera_Dias = CASE 
            WHEN DATEDIFF(DAY, CAST(c.FechaProgramacion AS DATE), c.FechaCita) < 0 THEN 0
            ELSE DATEDIFF(DAY, CAST(c.FechaProgramacion AS DATE), c.FechaCita)
        END,
        fa.SMSRecibido = c.SMSRecibido,
        fa.Monto_Pagado = CASE WHEN c.NoShow IN ('Yes', 'Pen') THEN 0 ELSE c.CostoAplicado END,
        fa.Es_Atendido = CASE WHEN c.NoShow IN ('Yes', 'Pen') THEN 0 ELSE 1 END,
        fa.Es_Ausencia = CASE WHEN c.NoShow = 'Yes' THEN 1 ELSE 0 END
    FROM dm.Fact_Atenciones fa
    JOIN oltp.Citas c ON fa.IdCita = c.IdCita;

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
        CASE 
            WHEN c.NoShow = 'Yes' THEN 'Ausencia/No-Show'
            WHEN c.NoShow = 'Pen' THEN 'Pendiente'
            ELSE 'Atendido'
        END,
        CASE 
            WHEN DATEDIFF(DAY, CAST(c.FechaProgramacion AS DATE), c.FechaCita) < 0 THEN 0
            ELSE DATEDIFF(DAY, CAST(c.FechaProgramacion AS DATE), c.FechaCita)
        END AS Tiempo_Espera_Dias, 
        c.SMSRecibido,
        CASE WHEN c.NoShow IN ('Yes', 'Pen') THEN 0 ELSE c.CostoAplicado END AS Monto_Pagado, 
        CASE WHEN c.NoShow IN ('Yes', 'Pen') THEN 0 ELSE 1 END,
        CASE WHEN c.NoShow = 'Yes' THEN 1 ELSE 0 END
    FROM oltp.Citas c
    JOIN dm.Dim_Paciente dp ON c.IdPaciente = dp.IdPaciente
    JOIN dm.Dim_Medico dmed ON c.IdOdontologo = dmed.IdOdontologo
    JOIN dm.Dim_Tratamiento dt ON c.IdTratamiento = dt.IdTratamiento 
    WHERE NOT EXISTS (SELECT 1 FROM dm.Fact_Atenciones fa WHERE fa.IdCita = c.IdCita);
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
WHERE f.Estado_Cita <> 'Pendiente'
GROUP BY t.Anio, t.Mes, t.NombreMes, p.Barrio;
GO

-- 4. DATASET PARA MACHINE LEARNING (excluye citas futuras en estado 'Pendiente')
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
JOIN dm.Dim_Tiempo time ON f.SK_Tiempo = time.SK_Tiempo
WHERE f.Estado_Cita <> 'Pendiente';
GO
