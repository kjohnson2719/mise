import ReactMarkdown, { type Components } from "react-markdown"

/** The assistant's replies: short paragraphs, lists and bold. */
const COMPONENTS: Components = {
  p: (props) => <p className="leading-relaxed" {...props} />,
  ul: (props) => <ul className="ml-5 list-disc space-y-1" {...props} />,
  ol: (props) => <ol className="ml-5 list-decimal space-y-1" {...props} />,
  li: (props) => <li className="pl-1" {...props} />,
  strong: (props) => <strong className="font-semibold" {...props} />,
  h1: (props) => <p className="font-semibold" {...props} />,
  h2: (props) => <p className="font-semibold" {...props} />,
  h3: (props) => <p className="font-semibold" {...props} />,
  a: ({ href, ...props }) => (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className="underline underline-offset-4"
      {...props}
    />
  ),
  code: (props) => (
    <code className="rounded bg-muted px-1 py-0.5 text-[0.9em]" {...props} />
  ),
  // No images or raw HTML from the model.
  img: () => null,
}

export function Markdown({ children }: { children: string }) {
  return (
    <div className="grid min-w-0 grid-cols-1 gap-3 text-[0.95rem] break-words">
      <ReactMarkdown components={COMPONENTS} skipHtml>
        {children}
      </ReactMarkdown>
    </div>
  )
}
