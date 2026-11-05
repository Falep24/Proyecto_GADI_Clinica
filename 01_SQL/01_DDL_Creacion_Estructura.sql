/* =====================================================================
   SCRIPT 1: ESTRUCTURA DE BASE DE DATOS (DDL)
   ===================================================================== */
USE master;
GO

-- 1. CIERRE DE CONEXIONES Y ELIMINACIÓN SEGURA (Solución error DDL 3)
IF EXISTS (SELECT name FROM sys.databases WHERE name = 'DentalCenterDB')
BEGIN
    ALTER DATABASE DentalCenterDB SET SINGLE_USER WITH ROLLBACK IMMEDIATE;
    DROP DATABASE DentalCenterDB;
END
GO

CREATE DATABASE DentalCenterDB;
GO

USE DentalCenterDB;
GO

-- 2. ESQUEMAS
IF SCHEMA_ID('stg')  IS NULL EXEC('CREATE SCHEMA stg');
IF SCHEMA_ID('oltp') IS NULL EXEC('CREATE SCHEMA oltp');
IF SCHEMA_ID('dm')   IS NULL EXEC('CREATE SCHEMA dm');
GO

-- 3. TABLAS STAGING (Capa de aterrizaje cruda)
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

-- Tabla de rechazos (Solución error Integridad 6)
IF OBJECT_ID('stg.Rechazos_Ingesta', 'U') IS NOT NULL DROP TABLE stg.Rechazos_Ingesta;
CREATE TABLE stg.Rechazos_Ingesta (
    IdRechazo INT IDENTITY(1,1) PRIMARY KEY,
    PatientId NVARCHAR(50),
    AppointmentID NVARCHAR(50),
    Motivo NVARCHAR(255),
    FechaRegistro DATETIME DEFAULT GETDATE()
);
GO

-- 4. TABLAS OLTP (Sistema Transaccional)
IF OBJECT_ID('oltp.Citas', 'U') IS NOT NULL DROP TABLE oltp.Citas;
IF OBJECT_ID('oltp.Pacientes', 'U') IS NOT NULL DROP TABLE oltp.Pacientes;
IF OBJECT_ID('oltp.Odontologos', 'U') IS NOT NULL DROP TABLE oltp.Odontologos;
IF OBJECT_ID('oltp.Tratamientos', 'U') IS NOT NULL DROP TABLE oltp.Tratamientos;
GO

CREATE TABLE oltp.Pacientes (
    IdPaciente    BIGINT        NOT NULL PRIMARY KEY CLUSTERED,
    Genero        CHAR(1)       NOT NULL,
    Edad          SMALLINT      NOT NULL,
    Barrio        NVARCHAR(100) NOT NULL
);

CREATE TABLE oltp.Odontologos (
    IdOdontologo INT IDENTITY(1,1) NOT NULL PRIMARY KEY CLUSTERED,
    Nombres      NVARCHAR(100) NOT NULL,
    Apellidos    NVARCHAR(100) NOT NULL,
    Especialidad NVARCHAR(100) NOT NULL,
    Activo       BIT           NOT NULL DEFAULT 1
);

CREATE TABLE oltp.Tratamientos (
    IdTratamiento INT            NOT NULL PRIMARY KEY CLUSTERED, 
    CodigoCPMS    VARCHAR(50)    NOT NULL,
    Descripcion   NVARCHAR(500)  NOT NULL,
    DuracionMeses INT            NOT NULL DEFAULT 1,
    Costo         DECIMAL(10,2)  NOT NULL
);

CREATE TABLE oltp.Citas (
    IdCita            INT           NOT NULL PRIMARY KEY CLUSTERED,
    IdPaciente        BIGINT        NOT NULL FOREIGN KEY REFERENCES oltp.Pacientes(IdPaciente),
    IdOdontologo      INT           NOT NULL FOREIGN KEY REFERENCES oltp.Odontologos(IdOdontologo),
    IdTratamiento     INT           NOT NULL FOREIGN KEY REFERENCES oltp.Tratamientos(IdTratamiento),
    FechaProgramacion DATETIME2(0)  NOT NULL,
    FechaCita         DATE          NOT NULL,
    SMSRecibido       BIT           NOT NULL DEFAULT 0,
    NoShow            VARCHAR(3)    NOT NULL,
    CostoAplicado     DECIMAL(10,2) NOT NULL
);
GO

-- 5. TABLAS DATA MART (Modelo Dimensional Kimball)
IF OBJECT_ID('dm.Fact_Atenciones', 'U') IS NOT NULL DROP TABLE dm.Fact_Atenciones;
IF OBJECT_ID('dm.Dim_Paciente', 'U') IS NOT NULL DROP TABLE dm.Dim_Paciente;
IF OBJECT_ID('dm.Dim_Medico', 'U') IS NOT NULL DROP TABLE dm.Dim_Medico;
IF OBJECT_ID('dm.Dim_Tratamiento', 'U') IS NOT NULL DROP TABLE dm.Dim_Tratamiento;
IF OBJECT_ID('dm.Dim_Tiempo', 'U') IS NOT NULL DROP TABLE dm.Dim_Tiempo;
IF OBJECT_ID('dm.Resultados_Prediccion_IA', 'U') IS NOT NULL DROP TABLE dm.Resultados_Prediccion_IA;
GO

CREATE TABLE dm.Dim_Paciente (
    SK_Paciente  INT IDENTITY(1,1) NOT NULL PRIMARY KEY CLUSTERED,
    IdPaciente   BIGINT        NOT NULL UNIQUE,
    Genero       CHAR(1)       NOT NULL,
    Edad         SMALLINT      NOT NULL,
    Rango_Etario VARCHAR(20)   NOT NULL, 
    Barrio       NVARCHAR(100) NOT NULL
);

CREATE TABLE dm.Dim_Medico (
    SK_Medico      INT IDENTITY(1,1) NOT NULL PRIMARY KEY CLUSTERED,
    IdOdontologo   INT           NOT NULL UNIQUE,
    NombreCompleto NVARCHAR(200) NOT NULL,
    Especialidad   NVARCHAR(100) NOT NULL
);

CREATE TABLE dm.Dim_Tratamiento (
    SK_Tratamiento INT IDENTITY(1,1) NOT NULL PRIMARY KEY CLUSTERED,
    IdTratamiento  INT           NOT NULL UNIQUE,
    Descripcion    NVARCHAR(500) NOT NULL,
    Duracion_Meses INT           NOT NULL,
    Costo_Total    DECIMAL(10,2) NOT NULL
);

CREATE TABLE dm.Dim_Tiempo (
    SK_Tiempo  INT         NOT NULL PRIMARY KEY CLUSTERED,
    Fecha      DATE        NOT NULL,
    Anio       SMALLINT    NOT NULL,
    Mes        TINYINT     NOT NULL,
    NombreMes  VARCHAR(12) NOT NULL,
    Trimestre  TINYINT     NOT NULL,
    Dia_Semana VARCHAR(15) NOT NULL
);

CREATE TABLE dm.Fact_Atenciones (
    ID_Hecho          INT IDENTITY(1,1) NOT NULL PRIMARY KEY CLUSTERED,
    IdCita            INT           NOT NULL UNIQUE,
    SK_Paciente       INT           NOT NULL FOREIGN KEY REFERENCES dm.Dim_Paciente(SK_Paciente),
    SK_Medico         INT           NOT NULL FOREIGN KEY REFERENCES dm.Dim_Medico(SK_Medico),
    SK_Tratamiento    INT           NOT NULL FOREIGN KEY REFERENCES dm.Dim_Tratamiento(SK_Tratamiento),
    SK_Tiempo         INT           NOT NULL FOREIGN KEY REFERENCES dm.Dim_Tiempo(SK_Tiempo),
    
    Estado_Cita       VARCHAR(20)   NOT NULL,
    Tiempo_Espera_Dias INT          NOT NULL,
    SMSRecibido       BIT           NOT NULL,
    Monto_Pagado      DECIMAL(10,2) NOT NULL,
    
    Es_Atendido       INT           NOT NULL,
    Es_Ausencia       INT           NOT NULL
);

CREATE TABLE dm.Resultados_Prediccion_IA (
    ID_Prediccion INT IDENTITY(1,1) PRIMARY KEY,
    IdCita INT NOT NULL, -- Predicción a nivel de cita, no de paciente histórico
    SK_Paciente INT NOT NULL,
    Probabilidad_Inasistencia DECIMAL(5,4) NOT NULL,
    Nivel_Riesgo VARCHAR(20) NOT NULL,
    Prediccion_Binary INT NOT NULL,
    Fecha_Evaluacion DATETIME DEFAULT GETDATE()
);
GO