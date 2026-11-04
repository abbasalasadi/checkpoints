/** Loading placeholder (V2 feature 7): a quiet pulsing block of the content's size. */
export function Skeleton({ height = '1rem', width = '100%' }: { height?: string; width?: string }) {
  return <div aria-hidden="true" className="cp-skeleton" style={{ height, width, borderRadius: 'var(--radius)' }} />;
}
