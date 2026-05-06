/**
 * SafeMarkdown — wrapper di react-markdown con sanitization layered (F1).
 *
 *  Layer 1: rehype-sanitize con schema GitHub-like (defaultSchema). Blocca
 *           <script>, <iframe>, on*, style arbitrari, attributi pericolosi.
 *  Layer 2: schema rinforzato con allow-list di protocolli su href/src
 *           (http, https, mailto, tel) — difesa-in-profondità contro
 *           bypass tipo `javascript:` o `data:` URI dentro link markdown.
 *  Layer 3: components custom che ricontrollano href/src tramite sanitizeUrl
 *           (catch-all per varianti con whitespace/control chars/case mix
 *           che alcuni parser potrebbero lasciar passare).
 *
 * Tutto il contenuto markdown da fonti non fidate (AI, utenti, webhook
 * esterni, executive_reports) DEVE passare per questo componente.
 */
import ReactMarkdown, { type Components } from "react-markdown";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import { type ReactNode, useMemo } from "react";
import { sanitizeUrl } from "@/lib/safe-url";

interface SafeMarkdownProps {
  children: string | null | undefined;
  components?: Components;
  className?: string;
}

// Schema rinforzato: forziamo allow-list protocolli per a/img.
// (defaultSchema ha già protocols={a:{href:[...]}} ma esplicitiamo per chiarezza
// e per coprire link-references generate da MDX/rehype.)
const SAFE_SCHEMA = {
  ...defaultSchema,
  protocols: {
    ...(defaultSchema.protocols || {}),
    href: ["http", "https", "mailto", "tel"],
    src: ["http", "https"],
    cite: ["http", "https"],
    longDesc: ["http", "https"],
  },
};

function SafeAnchor(props: any) {
  const { href, children, ...rest } = props;
  const safe = sanitizeUrl(href);
  if (!safe) {
    // URL bloccato: degradiamo a span (mostra il testo, nessun link)
    return <span {...rest}>{children}</span>;
  }
  return (
    <a href={safe} target="_blank" rel="noopener noreferrer nofollow" {...rest}>
      {children}
    </a>
  );
}

function SafeImage(props: any) {
  const { src, alt, ...rest } = props;
  const safe = sanitizeUrl(src, { allowedProtocols: ["https"] });
  if (!safe) return null;
  return <img src={safe} alt={alt ?? ""} loading="lazy" {...rest} />;
}

const BUILTIN_COMPONENTS: Components = {
  a: SafeAnchor,
  img: SafeImage,
};

export function SafeMarkdown({ children, components, className }: SafeMarkdownProps): ReactNode {
  const merged = useMemo<Components>(
    () => ({ ...BUILTIN_COMPONENTS, ...(components || {}) }),
    [components],
  );
  if (!children) return null;
  const content = typeof children === "string" ? children : String(children);
  const node = (
    <ReactMarkdown rehypePlugins={[[rehypeSanitize, SAFE_SCHEMA]]} components={merged}>
      {content}
    </ReactMarkdown>
  );
  return className ? <div className={className}>{node}</div> : node;
}
