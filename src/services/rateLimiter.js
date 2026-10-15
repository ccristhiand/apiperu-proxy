/**
 * Limitador de peticiones por ventana deslizante de 60 segundos.
 *
 * ApiPeruDev limita las consultas por minuto según el plan contratado.
 * Todas las llamadas a su API pasan por aquí: si ya se usó el cupo del
 * último minuto, la llamada espera su turno en vez de fallar.
 */

const VENTANA_MS = 60_000;

function dormir(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    const alAbortar = () => { clearTimeout(t); reject(signal.reason); };
    const t = setTimeout(() => { signal?.removeEventListener('abort', alAbortar); resolve(); }, ms);
    signal?.addEventListener('abort', alAbortar, { once: true });
  });
}

class RateLimiter {
  constructor(maxPorMinuto) {
    this.max = maxPorMinuto;
    this.marcas = [];          // instantes de las últimas llamadas
    this.bloqueadoHasta = 0;   // pausa forzada tras un "demasiadas solicitudes"
    this.cola = Promise.resolve();
  }

  /**
   * Espera hasta que haya cupo y lo reserva.
   * Los turnos se atienden en orden de llegada.
   * @param {(ms:number)=>void} [onEspera] se llama cuando hay que esperar.
   * @param {AbortSignal} [signal] permite cancelar la espera.
   * @param {number} [costo] cupos que consume la llamada (p. ej. una placa = 2).
   */
  acquire(onEspera, signal, costo = 1) {
    const turno = this.cola.then(() => this.#esperarCupo(onEspera, signal, costo));
    this.cola = turno.catch(() => {});
    return turno;
  }

  /** Pausa todas las llamadas durante `ms` (el proveedor indicó que nos pasamos). */
  bloquear(ms) {
    this.bloqueadoHasta = Math.max(this.bloqueadoHasta, Date.now() + ms);
  }

  async #esperarCupo(onEspera, signal, costo) {
    for (;;) {
      const ahora = Date.now();
      this.marcas = this.marcas.filter((t) => ahora - t < VENTANA_MS);

      let espera = 0;
      if (this.bloqueadoHasta > ahora) {
        espera = this.bloqueadoHasta - ahora;
      } else if (this.marcas.length + costo > this.max) {
        // Hay que esperar a que salgan de la ventana las llamadas necesarias
        const liberar = this.marcas.length + costo - this.max;
        espera = VENTANA_MS - (ahora - this.marcas[liberar - 1]) + 50;
      }

      if (!espera) {
        for (let i = 0; i < costo; i++) this.marcas.push(ahora);
        return;
      }

      onEspera?.(espera);
      await dormir(espera, signal);
    }
  }
}

module.exports = { RateLimiter, dormir };
