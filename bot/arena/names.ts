export function fileSafe(name: string): string {
  return name.replace(/[<>:"/\|?*]/g, '_');
}
