import { hintPoints, isUsage, usageBlocks } from '@/lib/hints';
import type { UsageBlock, UsageEntry } from '@/lib/hints';

/** Chinese, then pinyin and English in a lighter colour. */
function Entry({ e, strong = false }: { e: UsageEntry; strong?: boolean }) {
  return (
    <>
      <span lang="zh" className={strong ? 'text-[15px] font-semibold text-gray-900' : 'font-medium text-gray-900'}>
        {e.zh}
      </span>
      {e.pinyin && <span className="ml-1.5 text-gray-500">{e.pinyin}</span>}
      {e.en && <span className="text-gray-500"> — {e.en}</span>}
    </>
  );
}

function Block({ b }: { b: UsageBlock }) {
  return (
    <div className="space-y-1.5">
      {b.about && (
        <p lang="zh" className="text-xs font-medium text-gray-500">
          {b.about}
        </p>
      )}
      {b.right && (
        <p>
          <Entry e={b.right} strong />
        </p>
      )}
      {b.compare && (
        <p className="text-[13px]">
          <span className="mr-1.5 text-xs text-gray-400">vs</span>
          <Entry e={b.compare} />
        </p>
      )}
      {b.phrases.length > 0 && (
        <ul className="space-y-0.5 text-[13px]">
          {b.phrases.map((p, i) => (
            <li key={i} className="flex gap-2">
              <span aria-hidden className="text-gray-300">
                •
              </span>
              <span>
                <Entry e={p} />
              </span>
            </li>
          ))}
        </ul>
      )}
      {b.example && (
        <div className="border-l-2 border-gray-200 pl-2.5 text-[13px]">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Example</p>
          <p lang="zh" className="text-gray-900">
            {b.example.zh}
          </p>
          {b.example.pinyin && <p className="text-gray-500">{b.example.pinyin}</p>}
          {b.example.en && <p className="italic text-gray-500">{b.example.en}</p>}
        </div>
      )}
      {b.other.map((line, i) => (
        <p key={i} className="text-[13px]">
          {line}
        </p>
      ))}
    </div>
  );
}

/**
 * A "hints only" hint. Usage & examples (from v19) is shown one block per
 * problem — the right word or pattern, a word to compare, phrases and an
 * example, with pinyin and English set apart. Other text (older hints, the
 * explanation): one point per line, as a list when there is more than one.
 */
export default function HintText({ hint, className = '' }: { hint: string; className?: string }) {
  if (isUsage(hint)) {
    const blocks = usageBlocks(hint);
    return (
      <div className={`divide-y divide-gray-200 ${className}`}>
        {blocks.map((b, i) => (
          <div key={i} className={i ? 'pt-3' : ''}>
            <div className={i < blocks.length - 1 ? 'pb-3' : ''}>
              <Block b={b} />
            </div>
          </div>
        ))}
      </div>
    );
  }
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
