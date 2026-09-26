import { Fragment } from 'react'

/** **bold** inside a line; everything else stays text, nothing is parsed as HTML. */
function Inline({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*\n]+\*\*)/g)
  return (
    <>
      {parts.map((part, i) => {
        const bold = part.match(/^\*\*([^*\n]+)\*\*$/)
        return bold ? <strong key={i}>{bold[1]}</strong> : <Fragment key={i}>{part}</Fragment>
      })}
    </>
  )
}

type Block = { kind: 'p'; lines: string[] } | { kind: 'ul'; items: string[] }

/** Paragraphs split on blank lines; runs of "- " or "• " lines become a list. */
export function toBlocks(text: string): Block[] {
  const blocks: Block[] = []
  for (const raw of text.split('\n')) {
    const line = raw.trimEnd()
    const item = line.match(/^\s*(?:[-•*]|\d+[.)])\s+(.*)$/)
    const last = blocks.at(-1)
    if (item) {
      if (last?.kind === 'ul') last.items.push(item[1])
      else blocks.push({ kind: 'ul', items: [item[1]] })
    } else if (line.trim() === '') {
      if (last?.kind === 'p' && last.lines.length > 0) blocks.push({ kind: 'p', lines: [] })
    } else if (last?.kind === 'p') {
      last.lines.push(line)
    } else {
      blocks.push({ kind: 'p', lines: [line] })
    }
  }
  return blocks.filter((b) => (b.kind === 'p' ? b.lines.length > 0 : true))
}

/** The assistant's reply: the little formatting the prompt allows, and no more. */
export function MessageText({ text }: { text: string }) {
  return (
    <div className="space-y-2">
      {toBlocks(text).map((block, i) =>
        block.kind === 'ul' ? (
          <ul key={i} className="ml-4 list-disc space-y-1">
            {block.items.map((item, j) => (
              <li key={j}>
                <Inline text={item} />
              </li>
            ))}
          </ul>
        ) : (
          <p key={i} className="whitespace-pre-line">
            <Inline text={block.lines.join('\n')} />
          </p>
        ),
      )}
    </div>
  )
}
