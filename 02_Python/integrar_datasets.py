import pandas as pd

# 1. Cargar los DataFrames
df1 = pd.read_csv('C:\\Users\\fabri\\Downloads\\Proyecto_GADI_Clinica\\05_Datasets\\KaggleV2-May-2016.csv', dtype=str)
df2 = pd.read_csv('C:\\Users\\fabri\\Downloads\\Proyecto_GADI_Clinica\\05_Datasets\\Registro_clinica_dental.csv', dtype=str)

# 2. Unir los DataFrames
df_combinado = pd.concat([df1, df2], ignore_index=True)

# 3. Limpieza extrema de la última columna
# .str.strip() elimina cualquier espacio en blanco, \r, o \n oculto al inicio o final
df_combinado['No-Show'] = df_combinado['No-Show'].str.strip()

# 4. Exportar asegurando el salto de línea compatible con tu BULK INSERT
df_combinado.to_csv('consolidado_clinica_dental.csv', index=False, lineterminator='\n')