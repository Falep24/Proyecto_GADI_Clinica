/* =====================================================================
   SCRIPT 3: EJECUCIÓN ETL Y CARGA DE DATOS (DML)
   ===================================================================== */
USE DentalCenterDB;
GO

-- 1. LIMPIEZA DE TABLAS TEMPORALES (Staging)
TRUNCATE TABLE stg.Raw_NoShow;
TRUNCATE TABLE stg.Raw_CPMS;
GO

-- 2. CARGA DE ARCHIVOS CSV CRUDOS 
-- NOTA: Las rutas deben ser relativas al servidor de SQL Server. 
-- Modifica la ruta 'C:\Datasets\' según el disco del servidor donde alojes los archivos.

BULK INSERT stg.Raw_NoShow 
FROM 'C:\Users\fabri\Downloads\Proyecto_GADI_Clinica\05_Datasets\KaggleV2-May-2016.csv' 
WITH (FORMAT = 'CSV', FIRSTROW = 2, FIELDTERMINATOR = ',', ROWTERMINATOR = '0x0a', CODEPAGE = '65001');

BULK INSERT stg.Raw_CPMS 
FROM 'C:\Users\fabri\Downloads\Proyecto_GADI_Clinica\05_Datasets\cpms_odontologia.csv' 
-- Removido FORMAT='CSV' y ajustado el ROWTERMINATOR a '0x0a' para que lea los registros sin fallar
WITH (FORMAT = 'CSV', FIRSTROW = 2, FIELDTERMINATOR = ',', ROWTERMINATOR = '\n', CODEPAGE = '65001'); 
GO

-- 3. INSERCIÓN DE DATOS ESTÁTICOS INICIALES (Personal base)
IF NOT EXISTS (SELECT 1 FROM oltp.Odontologos)
BEGIN
    INSERT INTO oltp.Odontologos (Nombres, Apellidos, Especialidad) VALUES
    ('Carlos', 'Mendoza', 'Odontología General'),
    ('Lucía', 'Paredes', 'Endodoncia'),
    ('Jorge', 'Salas', 'Ortodoncia');
END;
GO

-- 4. EJECUCIÓN DE PROCEDIMIENTOS ALMACENADOS ETL
PRINT 'Iniciando carga hacia OLTP...';
EXEC stg.usp_CargarOLTP;
PRINT 'Carga OLTP finalizada.';

PRINT 'Iniciando carga hacia Data Mart...';
EXEC dm.usp_ETL_CargarDataMart;
PRINT 'Carga Data Mart finalizada.';
GO

-- 5. VERIFICACIÓN FINAL (Validar que las tablas tienen datos)
SELECT 'Staging Rechazos' AS Tabla, COUNT(*) AS TotalRegistros FROM stg.Rechazos_Ingesta
UNION ALL
SELECT 'OLTP Tratamientos', COUNT(*) FROM oltp.Tratamientos
UNION ALL
SELECT 'OLTP Pacientes', COUNT(*) FROM oltp.Pacientes
UNION ALL
SELECT 'OLTP Citas', COUNT(*) FROM oltp.Citas
UNION ALL
SELECT 'DM Dim_Paciente', COUNT(*) FROM dm.Dim_Paciente
UNION ALL
SELECT 'DM Fact_Atenciones', COUNT(*) FROM dm.Fact_Atenciones;
GO