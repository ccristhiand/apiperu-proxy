-- ============================================================
-- Migración 001: consulta de placas vehiculares
-- Para bases de datos creadas antes de agregar placas.
-- Es segura de ejecutar más de una vez.
--
--   mysql -u <usuario> -p apiperu_cache < sql/migrations/001_placas.sql
-- ============================================================

CREATE TABLE IF NOT EXISTS cache_placa (
  id               INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  placa            VARCHAR(7)        NOT NULL UNIQUE,
  marca            VARCHAR(100)      NULL,
  modelo           VARCHAR(150)      NULL,
  anio             SMALLINT UNSIGNED NULL,
  tipo_vehiculo    VARCHAR(100)      NULL,
  clase_vehiculo   VARCHAR(100)      NULL,
  numero_asientos  SMALLINT UNSIGNED NULL,
  vin              VARCHAR(50)       NULL,
  categoria_mtc    VARCHAR(20)       NULL,
  datos_extra      JSON              NULL,
  consultas        INT UNSIGNED      NOT NULL DEFAULT 1,
  primera_consulta DATETIME          NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ultima_consulta  DATETIME          NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_placa_ultima_consulta (ultima_consulta)
) ENGINE=InnoDB;

-- El historial de consultas debe aceptar el nuevo tipo
ALTER TABLE log_consultas
  MODIFY tipo ENUM('ruc','dni','placa') NOT NULL;
