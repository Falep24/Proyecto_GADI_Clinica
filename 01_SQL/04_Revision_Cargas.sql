USE DentalCenterDB;
GO

SELECT * FROM stg.Raw_NoShow;
SELECT * FROM stg.Raw_CPMS;

SELECT * FROM oltp.Odontologos;
SELECT * FROM oltp.Pacientes;
SELECT * FROM oltp.Tratamientos;
SELECT * FROM oltp.Citas;

SELECT * FROM dm.Dim_Paciente;
SELECT * FROM dm.Fact_Atenciones;
SELECT * FROM dm.Dim_Tiempo;
SELECT * FROM dm.Dim_Medico;
SELECT * FROM dm.Dim_Tratamiento;
SELECT * FROM dm.Resultados_Prediccion_IA;