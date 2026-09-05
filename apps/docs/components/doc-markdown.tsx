import type { ReactNode } from "react";
import { MarkdownAsync } from "react-markdown";
import rehypeAutolinkHeadings from "rehype-autolink-headings";
import rehypePrettyCode from "rehype-pretty-code";
import rehypeSlug from "rehype-slug";
import remarkGfm from "remark-gfm";
import { CopyCode } from "./copy-code";

function nodeText(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(nodeText).join("");
  if (node && typeof node === "object" && "props" in node) {
    return nodeText(
      (node as { props: { children?: ReactNode } }).props.children,
    );
  }
  return "";
}

export async function DocMarkdown({ markdown }: { markdown: string }) {
  return MarkdownAsync({
    children: markdown,
    remarkPlugins: [remarkGfm],
    rehypePlugins: [
      rehypeSlug,
      [rehypeAutolinkHeadings, { behavior: "wrap" }],
      [
        rehypePrettyCode,
        {
          theme: { dark: "github-dark-default", light: "github-light-default" },
          keepBackground: false,
        },
      ],
    ],
    components: {
      a: ({ href, children, ...props }) => {
        const external = href?.startsWith("http");
        return (
          <a
            href={href}
            {...props}
            {...(external ? { rel: "noreferrer", target: "_blank" } : {})}
          >
            {children}
          </a>
        );
      },
      pre: ({ children, ...props }) => (
        <div className="doc-code">
          <pre {...props}>{children}</pre>
          <CopyCode value={nodeText(children).replace(/\n$/, "")} />
        </div>
      ),
    },
  });
}
