export class Desk {
  readonly anchors = new Map<string, Element>();
  readonly parts = new Map<string, Element>();
  readonly sizes = new Map<string, { w: number; h: number }>();
  private readonly shown = new Map<string, string>();
  private readonly regs = new Map<string, (el: Element | null) => void>();
  private readonly partRefs = new Map<string, (el: Element | null) => void>();
  private readonly observers = new Map<string, ResizeObserver>();
  onResize: () => void = () => undefined;

  reg = (name: string): ((el: Element | null) => void) => {
    let f = this.regs.get(name);
    if (!f) {
      f = (el) => {
        if (el) this.anchors.set(name, el);
        else this.anchors.delete(name);
        this.shown.delete('a:' + name);
        this.shown.delete('t:' + name);
      };
      this.regs.set(name, f);
    }
    return f;
  };

  part = (name: string, sized = false): ((el: Element | null) => void) => {
    let f = this.partRefs.get(name);
    if (!f) {
      f = (el) => {
        this.observers.get(name)?.disconnect();
        this.observers.delete(name);
        if (!el) {
          this.parts.delete(name);
          return;
        }
        this.parts.set(name, el);
        if (!sized) return;
        const ro = new ResizeObserver((list) => {
          const r = list[list.length - 1]?.contentRect;
          if (!r) return;
          const was = this.sizes.get(name);
          if (was && was.w === r.width && was.h === r.height) return;
          this.sizes.set(name, { w: r.width, h: r.height });
          this.onResize();
        });
        ro.observe(el);
        this.observers.set(name, ro);
      };
      this.partRefs.set(name, f);
    }
    return f;
  };

  changed(key: string, value: string): boolean {
    if (this.shown.get(key) === value) return false;
    this.shown.set(key, value);
    return true;
  }
}
