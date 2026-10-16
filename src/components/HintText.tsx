import { hintPoints } from '@/lib/hints';

/** A "hints only" hint: one point per problem (one per line), shown as a list when there is more than one. */
export default function HintText({ hint, className = '' }: { hint: string; className?: string }) {
  const points = hintPoints(hint);
  if (points.length <= 1) return <p className={className}>{points[0] ?? hint}</p>;
  return (
    <ul className={`list-disc space-y-1 pl-5 ${className}`}>
      {points.map((p, i) => (
        <li key={i}>{p}</li>
      ))}
    </ul>
  );
}
