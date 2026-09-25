export function latest(): { next(): number; isCurrent(ticket: number): boolean } {
  let current = 0;
  return {
    next: () => { current += 1; return current; },
    isCurrent: (ticket) => ticket === current,
  };
}
