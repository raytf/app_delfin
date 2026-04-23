import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'

interface WikiPageData {
  path: string
  content: string
  metadata: Record<string, string>
}

export default function WikiPageReader() {
  const { pageId, kind } = useParams<{ pageId: string; kind: string }>()
  const [pageData, setPageData] = useState<WikiPageData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchPage = async () => {
      if (!pageId || !kind) {
        setError('Page ID or kind not provided')
        setLoading(false)
        return
      }

      try {
        setLoading(true)
        setError(null)
        
        const response = await fetch(`http://localhost:8321/memory/page?path=${encodeURIComponent(pageId)}&kind=${encodeURIComponent(kind)}`)
        
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`)
        }
        
        const data = await response.json()
        setPageData(data)
      } catch (err) {
        setError(`Failed to fetch page: ${err instanceof Error ? err.message : String(err)}`)
      } finally {
        setLoading(false)
      }
    }

    fetchPage()
  }, [pageId, kind])

  const renderMarkdown = (content: string) => {
    // Simple markdown rendering with wikilink support
    let result = content
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/# (.*?)\n/g, '<h1>$1</h1>')
      .replace(/## (.*?)\n/g, '<h2>$1</h2>')
      .replace(/### (.*?)\n/g, '<h3>$1</h3>')
      .replace(/\n\n/g, '<br/><br/>')
      .replace(/\n/g, '<br/>')
    
    // Handle wikilinks [[Page Name]]
    result = result.replace(/\[\[(.*?)\]\]/g, (match, pageName) => {
      return `<a href="#" class="text-blue-600 hover:underline" onClick="event.preventDefault(); window.api.memory.openPage('${pageName}')">${pageName}</a>`;
    });
    
    return result;
  }

  if (loading) {
    return (
      <div className="p-4">
        <h2 className="text-xl font-semibold mb-4">Loading Page...</h2>
        <p>Fetching wiki page content...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-4">
        <h2 className="text-xl font-semibold mb-4">Page Error</h2>
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative" role="alert">
          <strong className="font-bold">Error:</strong>
          <span className="block sm:inline"> {error}</span>
        </div>
      </div>
    )
  }

  if (!pageData) {
    return (
      <div className="p-4">
        <h2 className="text-xl font-semibold mb-4">Page Not Found</h2>
        <p>No page data available.</p>
      </div>
    )
  }

  return (
    <div className="p-4">
      <div className="mb-4">
        <button
          onClick={() => window.history.back()}
          className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300"
        >
          ← Back
        </button>
      </div>
      
      <h1 className="text-2xl font-bold mb-4">{pageData.metadata.title || pageId}</h1>
      
      <div className="mb-4 p-4 bg-gray-100 rounded">
        <h3 className="font-medium mb-2">Metadata</h3>
        <div className="grid grid-cols-2 gap-2 text-sm">
          {Object.entries(pageData.metadata).map(([key, value]) => (
            <div key={key} className="flex">
              <span className="font-medium mr-2">{key}:</span>
              <span>{value}</span>
            </div>
          ))}
        </div>
      </div>
      
      <div className="prose max-w-none">
        <div dangerouslySetInnerHTML={{ __html: renderMarkdown(pageData.content) }} />
      </div>
    </div>
  )
}