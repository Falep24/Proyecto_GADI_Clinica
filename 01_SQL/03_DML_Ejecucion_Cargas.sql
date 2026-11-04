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
-- (Recuerda modificar la ruta a una pública como C:\Datasets\ si tienes problemas de permisos)
BULK INSERT stg.Raw_NoShow 
FROM 'C:\Users\fabri\Downloads\Proyecto_GADI_Clinica\Proyecto_GADI_Clinica\05_Datasets\KaggleV2-May-2016.csv' 
WITH (FORMAT = 'CSV', FIRSTROW = 2, FIELDTERMINATOR = ',', ROWTERMINATOR = '0x0a');

BULK INSERT stg.Raw_CPMS 
FROM 'C:\Users\fabri\Downloads\Proyecto_GADI_Clinica\Proyecto_GADI_Clinica\05_Datasets\cpms_odontologia.csv' 
WITH (FORMAT = 'CSV', FIRSTROW = 2, FIELDTERMINATOR = ',', ROWTERMINATOR = '0x0a');
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
EXEC dw.usp_ETL_CargarDataMart;
PRINT 'Carga Data Mart finalizada.';
GO

-- 5. VERIFICACIÓN FINAL (Validar que las tablas tienen datos)
SELECT 'OLTP Pacientes' AS Tabla, COUNT(*) AS TotalRegistros FROM oltp.Pacientes
UNION ALL
SELECT 'OLTP Citas', COUNT(*) FROM oltp.Citas
UNION ALL
SELECT 'DW Dim_Paciente', COUNT(*) FROM dw.Dim_Paciente
UNION ALL
SELECT 'DW Fact_Atenciones', COUNT(*) FROM dw.Fact_Atenciones;
GO