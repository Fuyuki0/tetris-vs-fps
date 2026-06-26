// ─── Custom Event Bus ─────────────────────────────────────
// Lightweight pub/sub for decoupled communication between Tetris ↔ Gunner

class EventBus {
  constructor() {
    this.listeners = new Map();
  }

  on(event, callback, context) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push({ callback, context });
    return this;
  }

  off(event, callback) {
    if (!this.listeners.has(event)) return this;
    if (!callback) {
      this.listeners.delete(event);
    } else {
      const list = this.listeners.get(event);
      this.listeners.set(event, list.filter(l => l.callback !== callback));
    }
    return this;
  }

  emit(event, data) {
    if (!this.listeners.has(event)) return this;
    const list = this.listeners.get(event);
    for (const { callback, context } of list) {
      callback.call(context, data);
    }
    return this;
  }

  once(event, callback, context) {
    const wrapper = (data) => {
      callback.call(context, data);
      this.off(event, wrapper);
    };
    this.on(event, wrapper, context);
    return this;
  }

  removeAll() {
    this.listeners.clear();
    return this;
  }
}

// Singleton instance
const eventBus = new EventBus();
export default eventBus;
