/**
 * SafeMarkdown — wrapper di react-markdown con rehype-sanitize attivo.
 *
 * Audit C-Level finding F1 (output-injection da AI / lead via markdown).
 * Tutto il contenuto markdown proveniente da fonti non fidate (AI, utenti,
 * webhook esterni) DEVE essere renderizzato tramite questo componente per
 * impedire HTML/JS arbitrario, javascript: URI, on* handler, ecc.
 *
 * La schema di default di rehype-sanitize è quella di GitHub (ghSchema):
 * blocca <script>, <iframe>, attributi on*, javascript:/data: URI, style
 * arbitrari. Permette tag inline tipici (strong, em, code, a, ul, ...).
 *
 * Mantiene firma compatibile con react-markdown:
 *   <SafeMarkdown components={{...}}>{content}</SafeMarkdown>
 */
import ReactMarkdown, { type Components } from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import { type ReactNode } from "react";

interface SafeMarkdownProps {
  children: string | null | undefined;
  components?: Components;
  className?: string;
}

export function SafeMarkdown({ children, components, className }: SafeMarkdownProps): ReactNode {
  if (!children) return null;
  const content = typeof children === "string" ? children : String(children);
  if (className) {
    return (
      <div className={className}>
        <ReactMarkdown rehypePlugins={[rehypeSanitize]} components={components}>
          {content}
        </ReactMarkdown>
      </div>
    );
  }
  return (
    <ReactMarkdown rehypePlugins={[rehypeSanitize]} components={components}>
      {content}
    </ReactMarkdown>
  );
}
