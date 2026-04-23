import { useEffect, useState } from 'react'
import IngestStatusCard from './IngestStatusCard'

interface MemoryStats {
  sources: number
  entities: number
  concepts: number
  assets: number
  total_size_bytes: number
}

interface WikiPage {
  path: string
  title: string
  summary: string
  tags: string[]
  sources: string[]
  updated: string
}

interface SearchResult {
  path: string
  kind: string
  title: string
  preview: string
}

interface MemoryViewProps {
  onBack?: () => void
}

export default function MemoryView({ onBack }: MemoryViewProps) {
  const [stats, setStats] = useState<MemoryStats | null>(null)
  const [pages, setPages] = useState<WikiPage[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'overview' | 'pages' | 'search'>('overview')
  const [showIngestStatus, setShowIngestStatus] = useState(true)

  // Fetch memory stats
  const fetchStats = async () => {
    try {
      const response = await fetch('http://localhost:8321/memory/stats')
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }
      const data = await response.json()
      setStats(data)
    } catch (err) {
      setError(`Failed to fetch memory stats: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  // Fetch wiki index
  const fetchIndex = async () => {
    try {
      const response = await fetch('http://localhost:8321/memory/index')
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }
      const data = await response.json()
      setPages(data.pages || [])
    } catch (err) {
      setError(`Failed to fetch wiki index: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  // Perform search
  const performSearch = async (query: string) => {
    if (!query.trim()) {
      setSearchResults([])
      return
    }
    
    try {
      const response = await fetch(`http://localhost:8321/memory/search?query=${encodeURIComponent(query)}&limit=10`)
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }
      const data = await response.json()
      setSearchResults(data.results || [])
    } catch (err) {
      setError(`Failed to search wiki: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  // Check memory health
  const checkHealth = async () => {
    try {
      const response = await fetch('http://localhost:8321/memory/health')
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }
      return true
    } catch (err) {
      return false
    }
  }

  useEffect(() => {
    const loadData = async () => {
      setLoading(true)
      setError(null)
      
      const isHealthy = await checkHealth()
      if (!isHealthy) {
        setError('Memory system is not available')
        setLoading(false)
        return
      }
      
      await Promise.all([fetchStats(), fetchIndex()])
      setLoading(false)
    }
    
    loadData()
  }, [])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    performSearch(searchQuery)
  }

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
  }

  if (loading) {
    return (
      <div className="p-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">Memory Wiki</h2>
          {onBack && (
            <button
              onClick={onBack}
              className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300 transition-colors"
            >
              ← Back to Menu
            </button>
          )}
        </div>
        <p>Loading memory system...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">Memory Wiki</h2>
          {onBack && (
            <button
              onClick={onBack}
              className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300 transition-colors"
            >
              ← Back to Menu
            </button>
          )}
        </div>
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative" role="alert">
          <strong className="font-bold">Error:</strong>
          <span className="block sm:inline"> {error}</span>
        </div>
      </div>
    )
  }

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold">Memory Wiki</h2>
        {onBack && (
          <button
            onClick={onBack}
            className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300 transition-colors"
          >
            ← Back to Menu
          </button>
        )}
      </div>
      
      <div className="mb-4">
        <div className="flex space-x-2 mb-4">
          <button
            className={`px-4 py-2 rounded ${activeTab === 'overview' ? 'bg-blue-500 text-white' : 'bg-gray-200'}`}
            onClick={() => setActiveTab('overview')}
          >
            Overview
          </button>
          <button
            className={`px-4 py-2 rounded ${activeTab === 'pages' ? 'bg-blue-500 text-white' : 'bg-gray-200'}`}
            onClick={() => setActiveTab('pages')}
          >
            Pages
          </button>
          <button
            className={`px-4 py-2 rounded ${activeTab === 'search' ? 'bg-blue-500 text-white' : 'bg-gray-200'}`}
            onClick={() => setActiveTab('search')}
          >
            Search
          </button>
        </div>
      </div>
      
      {showIngestStatus && (
        <div className="mb-6">
          <IngestStatusCard onClose={() => setShowIngestStatus(false)} />
        </div>
      )}

      {activeTab === 'overview' && (
        <div className="mb-6">
          <h3 className="text-lg font-medium mb-3">Memory System Overview</h3>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div className="bg-gray-100 p-4 rounded">
              <div className="text-sm text-gray-600">Sources</div>
              <div className="text-2xl font-bold">{stats?.sources || 0}</div>
            </div>
            <div className="bg-gray-100 p-4 rounded">
              <div className="text-sm text-gray-600">Entities</div>
              <div className="text-2xl font-bold">{stats?.entities || 0}</div>
            </div>
            <div className="bg-gray-100 p-4 rounded">
              <div className="text-sm text-gray-600">Concepts</div>
              <div className="text-2xl font-bold">{stats?.concepts || 0}</div>
            </div>
            <div className="bg-gray-100 p-4 rounded">
              <div className="text-sm text-gray-600">Assets</div>
              <div className="text-2xl font-bold">{stats?.assets || 0}</div>
            </div>
          </div>
          <div className="bg-gray-100 p-4 rounded">
            <div className="text-sm text-gray-600">Total Size</div>
            <div className="text-2xl font-bold">{stats ? formatBytes(stats.total_size_bytes) : '0 B'}</div>
          </div>
        </div>
      )}

      {activeTab === 'pages' && (
        <div className="mb-6">
          <h3 className="text-lg font-medium mb-3">Wiki Pages</h3>
          {pages.length === 0 ? (
            <p className="text-gray-600">No pages found in the wiki.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full bg-white">
                <thead>
                  <tr>
                    <th className="py-2 px-4 border-b">Title</th>
                    <th className="py-2 px-4 border-b">Summary</th>
                    <th className="py-2 px-4 border-b">Tags</th>
                    <th className="py-2 px-4 border-b">Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {pages.map((page, index) => (
                    <tr key={index} className="hover:bg-gray-50">
                      <td className="py-2 px-4 border-b">{page.title}</td>
                      <td className="py-2 px-4 border-b">{page.summary}</td>
                      <td className="py-2 px-4 border-b">{page.tags.join(', ')}</td>
                      <td className="py-2 px-4 border-b">{page.updated}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === 'search' && (
        <div className="mb-6">
          <h3 className="text-lg font-medium mb-3">Search Wiki</h3>
          <form onSubmit={handleSearch} className="mb-4">
            <div className="flex">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search for pages..."
                className="flex-1 px-4 py-2 border border-gray-300 rounded-l focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                type="submit"
                className="px-4 py-2 bg-blue-500 text-white rounded-r hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                Search
              </button>
            </div>
          </form>
          
          {searchResults.length === 0 && searchQuery.trim() === '' ? (
            <p className="text-gray-600">Enter a search query above.</p>
          ) : searchResults.length === 0 ? (
            <p className="text-gray-600">No results found.</p>
          ) : (
            <div className="space-y-4">
              {searchResults.map((result, index) => (
                <div key={index} className="border border-gray-200 rounded p-4">
                  <div className="flex items-center mb-2">
                    <span className={`px-2 py-1 text-xs font-medium rounded ${result.kind === 'source' ? 'bg-blue-100 text-blue-800' : result.kind === 'entity' ? 'bg-green-100 text-green-800' : 'bg-purple-100 text-purple-800'}`}>
                      {result.kind}
                    </span>
                    <h4 className="ml-2 font-medium">{result.title}</h4>
                  </div>
                  <p className="text-gray-600 text-sm mb-2">Path: {result.path}</p>
                  <div className="text-gray-800" dangerouslySetInnerHTML={{ __html: result.preview }} />
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}