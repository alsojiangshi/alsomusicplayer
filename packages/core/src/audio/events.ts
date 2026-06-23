/** 轻量事件发射器（零依赖） */

type Listener = (...args: any[]) => void;

export class TypedEmitter {
  private handlers = new Map<string, Set<Listener>>();

  on(event: string, cb: Listener): void {
    if (!this.handlers.has(event)) this.handlers.set(event, new Set());
    this.handlers.get(event)!.add(cb);
  }

  off(event: string, cb: Listener): void {
    this.handlers.get(event)?.delete(cb);
  }

  emit(event: string, ...args: any[]): void {
    this.handlers.get(event)?.forEach(cb => cb(...args));
  }

  removeAll(): void {
    this.handlers.clear();
  }
}
