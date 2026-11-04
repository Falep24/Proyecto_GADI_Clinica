/* =====================================================================
   SCRIPT 1: ESTRUCTURA DE BASE DE DATOS (DDL)
   ===================================================================== */
USE master;
GO
IF EXISTS (SELECT name FROM sys.databases WHERE name = 'DentalCenterDB')
    DROP DATABASE DentalCenterDB;
GO

CREATE DATABASE DentalCenterDB;
GO

USE DentalCenterDB;
GO

-- 1. ESQUEMAS
IF SCHEMA_ID('stg')  IS NULL EXEC('CREATE SCHEMA stg');
IF SCHEMA_ID('oltp') IS NULL EXEC('CREATE SCHEMA oltp');
IF SCHEMA_ID('dw')   IS NULL EXEC('CREATE SCHEMA dw');
GO

-- 2. TABLAS STAGING (Capa de aterrizaje cruda)
IF OBJECT_ID('stg.Raw_NoShow', 'U') IS NOT NULL DROP TABLE stg.Raw_NoShow;
CREATE TABLE stg.Raw_NoShow (
    PatientId       NVARCHAR(50)  NULL,
    AppointmentID   NVARCHAR(50)  NULL,
    Gender          NVARCHAR(10)  NULL,
    ScheduledDay    NVARCHAR(50)  NULL,
    AppointmentDay  NVARCHAR(50)  NULL,
    Age             NVARCHAR(10)  NULL,
    Neighbourhood   NVARCHAR(100) NULL,
    Scholarship     NVARCHAR(5)   NULL,
    Hipertension    NVARCHAR(5)   NULL,
    Diabetes        NVARCHAR(5)   NULL,
    Alcoholism      NVARCHAR(5)   NULL,
    Handcap         NVARCHAR(5)   NULL,
    SMS_received    NVARCHAR(5)   NULL,
    NoShow          NVARCHAR(10)  NULL
);

IF OBJECT_ID('stg.Raw_CPMS', 'U') IS NOT NULL DROP TABLE stg.Raw_CPMS;
CREATE TABLE stg.Raw_CPMS (
    Codigo       NVARCHAR(50)   NULL,
    Descripcion  NVARCHAR(1000) NULL,
    Tarifa       NVARCHAR(50)   NULL
);
GO

-- 3. TABLAS OLTP (Sistema Transaccional)
IF OBJECT_ID('oltp.Citas', 'U') IS NOT NULL DROP TABLE oltp.Citas;
IF OBJECT_ID('oltp.Pacientes', 'U') IS NOT NULL DROP TABLE oltp.Pacientes;
IF OBJECT_ID('oltp.Odontologos', 'U') IS NOT NULL DROP TABLE oltp.Odontologos;
IF OBJECT_ID('oltp.Tratamientos', 'U') IS NOT NULL DROP TABLE oltp.Tratamientos;
GO

CREATE TABLE oltp.Pacientes (
    IdPaciente    BIGINT        NOT NULL PRIMARY KEY CLUSTERED,
    Genero        CHAR(1)       NOT NULL,
    Edad          SMALLINT      NOT NULL,
    Barrio        NVARCHAR(100) NOT NULL,
    Beca          BIT           NOT NULL DEFAULT 0,
    Hipertension  BIT           NOT NULL DEFAULT 0,
    Diabetes      BIT           NOT NULL DEFAULT 0,
    Alcoholismo   BIT           NOT NULL DEFAULT 0,
    Discapacidad  TINYINT       NOT NULL DEFAULT 0
);

CREATE TABLE oltp.Odontologos (
    IdOdontologo INT IDENTITY(1,1) NOT NULL PRIMARY KEY CLUSTERED,
    Nombres      NVARCHAR(100) NOT NULL,
    Apellidos    NVARCHAR(100) NOT NULL,
    Especialidad NVARCHAR(100) NOT NULL,
    Activo       BIT           NOT NULL DEFAULT 1
);

CREATE TABLE oltp.Tratamientos (
    IdTratamiento INT IDENTITY(1,1) NOT NULL PRIMARY KEY CLUSTERED,
    CodigoCPMS    VARCHAR(50)    NOT NULL,
    Descripcion   NVARCHAR(500)  NOT NULL,
    DuracionMeses INT            NOT NULL DEFAULT 1, -- Nuevo campo operativo
    Costo         DECIMAL(10,2)  NOT NULL
);

CREATE TABLE oltp.Citas (
    IdCita            INT           NOT NULL PRIMARY KEY CLUSTERED,
    IdPaciente        BIGINT        NOT NULL FOREIGN KEY REFERENCES oltp.Pacientes(IdPaciente),
    IdOdontologo      INT           NOT NULL FOREIGN KEY REFERENCES oltp.Odontologos(IdOdontologo),
    IdTratamiento     INT           NOT NULL,
    FechaProgramacion DATETIME2(0)  NOT NULL,
    FechaCita         DATE          NOT NULL,
    SMSRecibido       BIT           NOT NULL DEFAULT 0,
    NoShow            VARCHAR(3)    NOT NULL,
    CostoAplicado     DECIMAL(10,2) NOT NULL
);
GO

-- 4. TABLAS DATA MART (Modelo Dimensional Kimball)
IF OBJECT_ID('dw.Fact_Atenciones', 'U') IS NOT NULL DROP TABLE dw.Fact_Atenciones;
IF OBJECT_ID('dw.Dim_Paciente', 'U') IS NOT NULL DROP TABLE dw.Dim_Paciente;
IF OBJECT_ID('dw.Dim_Medico', 'U') IS NOT NULL DROP TABLE dw.Dim_Medico;
IF OBJECT_ID('dw.Dim_Tratamiento', 'U') IS NOT NULL DROP TABLE dw.Dim_Tratamiento;
IF OBJECT_ID('dw.Dim_Tiempo', 'U') IS NOT NULL DROP TABLE dw.Dim_Tiempo;
IF OBJECT_ID('dw.Resultados_Prediccion_IA', 'U') IS NOT NULL DROP TABLE dw.Resultados_Prediccion_IA;
GO

CREATE TABLE dw.Dim_Paciente (
    SK_Paciente  INT IDENTITY(1,1) NOT NULL PRIMARY KEY CLUSTERED,
    IdPaciente   BIGINT        NOT NULL UNIQUE,
    Genero       CHAR(1)       NOT NULL,
    Edad         SMALLINT      NOT NULL,
    Barrio       NVARCHAR(100) NOT NULL
);

CREATE TABLE dw.Dim_Medico (
    SK_Medico      INT IDENTITY(1,1) NOT NULL PRIMARY KEY CLUSTERED,
    IdOdontologo   INT           NOT NULL UNIQUE,
    NombreCompleto NVARCHAR(200) NOT NULL,
    Especialidad   NVARCHAR(100) NOT NULL
);

CREATE TABLE dw.Dim_Tratamiento (
    SK_Tratamiento INT IDENTITY(1,1) NOT NULL PRIMARY KEY CLUSTERED,
    IdTratamiento  INT           NOT NULL,
    Descripcion    NVARCHAR(500) NOT NULL,
    Duracion_Meses INT           NOT NULL, -- Nuevo campo
    Costo_Total    DECIMAL(10,2) NOT NULL  -- Renombrado
);

CREATE TABLE dw.Dim_Tiempo (
    SK_Tiempo  INT         NOT NULL PRIMARY KEY CLUSTERED,
    Fecha      DATE        NOT NULL,
    Anio       SMALLINT    NOT NULL,
    Mes        TINYINT     NOT NULL,
    NombreMes  VARCHAR(12) NOT NULL,
    Trimestre  TINYINT     NOT NULL,       -- Nuevo campo
    Dia_Semana VARCHAR(15) NOT NULL        -- Nuevo campo
);

CREATE TABLE dw.Fact_Atenciones (
    ID_Hecho          INT IDENTITY(1,1) NOT NULL PRIMARY KEY CLUSTERED,
    IdCita            INT           NOT NULL UNIQUE, -- Necesario para el flujo ETL (no duplicar)
    SK_Paciente       INT           NOT NULL FOREIGN KEY REFERENCES dw.Dim_Paciente(SK_Paciente),
    SK_Medico         INT           NOT NULL FOREIGN KEY REFERENCES dw.Dim_Medico(SK_Medico),
    SK_Tratamiento    INT           NOT NULL FOREIGN KEY REFERENCES dw.Dim_Tratamiento(SK_Tratamiento),
    SK_Tiempo         INT           NOT NULL FOREIGN KEY REFERENCES dw.Dim_Tiempo(SK_Tiempo),
    
    -- Métricas / Medidas
    Estado_Cita       VARCHAR(20)   NOT NULL,
    Tiempo_Espera_Min INT           NOT NULL,
    Monto_Pagado      DECIMAL(10,2) NOT NULL,
    
    -- Variables Calculadas para Análisis y Machine Learning
    Es_Atendido       INT           NOT NULL,
    Es_Ausencia       INT           NOT NULL
);

CREATE TABLE Resultados_Prediccion_IA (
    SK_Paciente INT PRIMARY KEY,
    Probabilidad_Abandono DECIMAL(5,4) NOT NULL, -- Valor entre 0.0000 y 1.0000
    Nivel_Riesgo VARCHAR(20) NOT NULL,            -- 'Riesgo Alto', 'Riesgo Medio', 'Riesgo Bajo'
    Prediccion_Binary INT NOT NULL,              -- 1 = Abandonará, 0 = Continuará
    Fecha_Evaluacion DATETIME DEFAULT GETDATE()
);
GO

SELECT * FROM Resultados_Prediccion_IA