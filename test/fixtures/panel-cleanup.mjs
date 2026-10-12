/** Fixture resources only. Dispose in reverse acquisition order and retain every cleanup error. */
export class PanelCleanup {
  #callbacks = [];
  #closing = null;
  defer(callback) {
    if (typeof callback !== 'function' || this.#closing) throw new Error('INVALID_CLEANUP_REGISTRATION');
    this.#callbacks.push(callback);
  }
  close() {
    this.#closing ??= Promise.resolve().then(async () => {
      const errors = [];
      while (this.#callbacks.length) {
        try { await this.#callbacks.pop()(); } catch (error) { errors.push(error); }
      }
      if (errors.length) throw new AggregateError(errors, 'PANEL_FIXTURE_CLEANUP_FAILED');
    });
    return this.#closing;
  }
}
