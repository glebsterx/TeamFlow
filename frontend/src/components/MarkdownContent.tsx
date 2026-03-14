import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface MarkdownContentProps {
  content: string;
  className?: string;
}

export default function MarkdownContent({ content, className = '' }: MarkdownContentProps) {
  // Конвертируем одиночные переносы строк в markdown line breaks (  \n)
  // чтобы Shift+Enter и обычный Enter сохраняли переносы при рендеринге
  const processedContent = content.replace(/([^\n])\n(?!\n)/g, '$1  \n');
  return (
    <div className={`text-sm text-gray-700 ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => <p className="mb-1.5 last:mb-0">{children}</p>,
          strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
          em: ({ children }) => <em className="italic">{children}</em>,
          ul: ({ children }) => <ul className="list-disc list-inside space-y-0.5 mb-1.5">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal list-inside space-y-0.5 mb-1.5">{children}</ol>,
          li: ({ children }) => <li>{children}</li>,
          code: ({ inline, children }: any) => inline
            ? <code className="bg-gray-100 px-1 py-0.5 rounded text-xs font-mono">{children}</code>
            : <pre className="bg-gray-100 p-2 rounded text-xs font-mono overflow-x-auto mb-1.5 whitespace-pre-wrap"><code>{children}</code></pre>,
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">{children}</a>
          ),
          h1: ({ children }) => <h1 className="text-base font-bold mb-1">{children}</h1>,
          h2: ({ children }) => <h2 className="text-sm font-bold mb-1">{children}</h2>,
          h3: ({ children }) => <h3 className="text-sm font-semibold mb-1">{children}</h3>,
          blockquote: ({ children }) => (
            <blockquote className="border-l-4 border-gray-300 pl-3 text-gray-600 mb-1.5">{children}</blockquote>
          ),
        }}
      >
        {processedContent}
      </ReactMarkdown>
    </div>
  );
}
