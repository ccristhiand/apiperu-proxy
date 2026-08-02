-- ============================================================
-- Base de datos: apiperu_cache
-- ============================================================

CREATE DATABASE IF NOT EXISTS apiperu_cache
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE apiperu_cache;

-- ------------------------------------------------------------
-- Tabla de usuarios (para autenticación)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS usuarios (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  nombre      VARCHAR(100)  NOT NULL,
  email       VARCHAR(150)  NOT NULL UNIQUE,
  password    VARCHAR(255)  NOT NULL,
  activo      TINYINT(1)    NOT NULL DEFAULT 1,
  creado_en   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- Caché de consultas RUC
-- Campos ajustados a la respuesta real de ApiPeruDev
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cache_ruc (
  id                      INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  ruc                     CHAR(11)     NOT NULL UNIQUE,
  razon_social            VARCHAR(300) NOT NULL,
  estado_contribuyente    VARCHAR(50)  NULL,
  condicion_contribuyente VARCHAR(50)  NULL,
  departamento            VARCHAR(100) NULL,
  provincia               VARCHAR(100) NULL,
  distrito                VARCHAR(100) NULL,
  direccion               TEXT         NULL,
  datos_extra             JSON         NULL,
  consultas               INT UNSIGNED NOT NULL DEFAULT 1,
  primera_consulta        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ultima_consulta         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- Caché de consultas DNI / RENIEC
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cache_dni (
  id               INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  dni              CHAR(8)      NOT NULL UNIQUE,
  nombres          VARCHAR(200) NOT NULL,
  apellido_paterno VARCHAR(100) NULL,
  apellido_materno VARCHAR(100) NULL,
  nombre_completo  VARCHAR(400) AS (
    CONCAT_WS(' ', apellido_paterno, apellido_materno, nombres)
  ) STORED,
  codigo_verificacion CHAR(1)  NULL,
  datos_extra      JSON         NULL,
  consultas        INT UNSIGNED NOT NULL DEFAULT 1,
  primera_consulta DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ultima_consulta  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- Log de todas las consultas realizadas
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS log_consultas (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  usuario_id INT UNSIGNED        NULL,
  tipo       ENUM('ruc','dni')   NOT NULL,
  numero     VARCHAR(15)         NOT NULL,
  fuente     ENUM('cache','api') NOT NULL,
  ip         VARCHAR(45)         NULL,
  creado_en  DATETIME            NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB;
-- ------------------------------------------------------------
-- Usuario admin por defecto  (password: Admin123!)
-- Cámbialo inmediatamente después de instalar
-- ------------------------------------------------------------
INSERT IGNORE INTO usuarios (nombre, email, password)
VALUES (
  'Administrador',
  'admin@tudominio.com',
  '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi'
);
