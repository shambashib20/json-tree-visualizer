import React, { useCallback, useEffect, useRef, useState } from 'react'
import ReactFlow, {
    useNodesState,
    useEdgesState,
    MiniMap,
    Controls,
    Background,
} from 'reactflow'
import 'reactflow/dist/style.css'

const SAMPLE_JSON = `{
  "user": {
    "id": 1,
    "name": "John Doe",
    "address": {
      "city": "New York",
      "country": "USA"
    }
  },
  "items": [
    "name": "item1",
    "name": "item2"
  ]
}`

const NODE_WIDTH = 160
const NODE_HEIGHT = 48

function getNodeStyle(type, highlighted) {
    const base = {
        padding: 10,
        borderRadius: 8,
        minWidth: NODE_WIDTH,
        minHeight: NODE_HEIGHT,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
        border: highlighted ? '2px solid #ff9800' : '1px solid rgba(0,0,0,0.08)',
    }
    if (type === 'object') return { ...base, background: '#6c5ce7', color: 'white' }
    if (type === 'array') return { ...base, background: '#00b894', color: 'white' }
    return { ...base, background: '#fdcb6e', color: '#333' }
}

let idCounter = 1
const genId = () => `n_${idCounter++}`

function traverseToNodes(json, path = '$', depth = 0, x = 0, y = 0, nodes = [], edges = [], parentId = null) {
    const nodeId = genId()
    const type = Array.isArray(json)
        ? 'array'
        : json !== null && typeof json === 'object'
            ? 'object'
            : 'primitive'

    const isRoot = path === '$'

    const label = (() => {
        if (type === 'object') return path.split('.').slice(-1)[0]
        if (type === 'array') return path.split('.').slice(-1)[0]
        return `${path.split('.').slice(-1)[0]}: ${String(json)}`
    })()


    if (!isRoot) {
        nodes.push({
            id: nodeId,
            data: { label, path, value: json, type },
            position: { x: x + depth * 220, y },
            style: getNodeStyle(type, false),
        })

        if (parentId)
            edges.push({ id: `e_${parentId}_${nodeId}`, source: parentId, target: nodeId })
    }

    if (type === 'object') {
        let childY = y
        for (const key of Object.keys(json)) {
            traverseToNodes(json[key], `${path === '$' ? '$' : path}.${key}`, isRoot ? depth : depth + 1, x, childY, nodes, edges, isRoot ? parentId : nodeId)
            childY += 120
        }
    } else if (type === 'array') {
        let childY = y
        for (let i = 0; i < json.length; i++) {
            traverseToNodes(json[i], `${path}[${i}]`, isRoot ? depth : depth + 1, x, childY, nodes, edges, isRoot ? parentId : nodeId)
            childY += 120
        }
    }

    return { nodes, edges }
}

function parsePathToNormalized(path) {
    if (!path) return null
    let p = path.trim()
    if (p.startsWith('$')) p = p.slice(1)
    if (p.startsWith('.')) p = p.slice(1)
    return p
}


function trySanitizeText(text) {

    if (!(/\[\s*"(?:[^"\\]|\\.)*"\s*:/m.test(text))) {
        return text
    }


    return text.replace(/\[([^\[\]]*?"[^"\[\]]*?"\s*:\s*[^,\[\]]+(?:\s*,\s*"[^"\[\]]*?"\s*:\s*[^,\[\]]+)*)\]/gs, (match, inner) => {

        const parts = inner.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/).map(p => p.trim()).filter(Boolean)

        const keyValRegex = /^\s*"([^"]+)"\s*:\s*(.+)\s*$/s
        const allMatch = parts.every(p => keyValRegex.test(p))
        if (!allMatch) {

            return match
        }

        const objs = parts.map(p => {
            const m = p.match(keyValRegex)
            if (!m) return null
            const key = m[1]
            let val = m[2].trim()

            const isQuoted = /^".*"$/.test(val)
            const isLiteral = /^(?:-?\d+(\.\d+)?|true|false|null)$/i.test(val)
            if (!isQuoted && !isLiteral && !val.startsWith('{') && !val.startsWith('[')) {

                val = JSON.stringify(val.replace(/^"(.*)"$/, '$1'))
            }
            return `{${JSON.stringify(key)}:${val}}`
        }).filter(Boolean)
        return `[${objs.join(',')}]`
    })
}

export default function App() {
    const [jsonText, setJsonText] = useState(SAMPLE_JSON)
    const [error, setError] = useState('')
    const [searchMessage, setSearchMessage] = useState('')

    const [nodes, setNodes, onNodesChange] = useNodesState([])
    const [edges, setEdges, onEdgesChange] = useEdgesState([])

    const rfInstance = useRef(null)
    const searchInputRef = useRef(null)

    const parseWithRecovery = useCallback((text) => {

        try {
            return { parsed: JSON.parse(text), sanitized: false }
        } catch (err) {

            try {
                const candidate = trySanitizeText(text)
                if (candidate === text) {

                    throw err
                }
                const parsed = JSON.parse(candidate)
                return { parsed, sanitized: true, sanitizedText: candidate }
            } catch (err2) {

                throw err
            }
        }
    }, [])

    const handleGenerate = useCallback(() => {
        setError('')
        idCounter = 1
        try {
            const { parsed, sanitized, sanitizedText } = parseWithRecovery(jsonText)
            const { nodes: newNodes, edges: newEdges } = traverseToNodes(parsed)
            setNodes(newNodes)
            setEdges(newEdges)
            if (sanitized) {
                setError('Input was auto-sanitized (heuristic).')

                setJsonText(sanitizedText)
            } else {
                setError('')
            }
            setTimeout(() => {
                if (rfInstance.current && rfInstance.current.fitView) rfInstance.current.fitView({ padding: 0.2 })
            }, 150)
        } catch (e) {

            setError(`Invalid JSON: ${e.message}`)
        }
    }, [jsonText, parseWithRecovery, setNodes, setEdges])

    useEffect(() => {
        handleGenerate()

    }, [])

    const handleSearch = useCallback(
        (query) => {
            if (!query) return
            const normalized = parsePathToNormalized(query)
            if (!normalized) return
            const match = nodes.find((n) => n.data.path.endsWith(normalized) || n.data.path === '$.' + normalized)
            if (match) {
                const updated = nodes.map((n) => ({ ...n, style: getNodeStyle(n.data.type, n.id === match.id) }))
                setNodes(updated)
                setSearchMessage('Match found')
                if (rfInstance.current && typeof rfInstance.current.setCenter === 'function') {

                    try {
                        rfInstance.current.setCenter(match.position.x + NODE_WIDTH / 2, match.position.y + NODE_HEIGHT / 2, { zoom: 1.3 })
                    } catch (err) {
                        rfInstance.current.fitView && rfInstance.current.fitView({ padding: 0.2 })
                    }
                }
            } else {
                setSearchMessage('No match found')
            }
        },
        [nodes, setNodes]
    )

    return (
        <div className="app-root" style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
            <div className="panel" style={{ padding: 20 }}>
                <h2 className="title">JSON Tree Visualizer</h2>
                <div className="controls-row" style={{ display: 'flex', gap: 20 }}>
                    <textarea
                        className="json-input"
                        value={jsonText}
                        onChange={(e) => setJsonText(e.target.value)}
                        style={{ width: '40%', height: 300, fontFamily: 'monospace', padding: 10 }}
                    />
                    <div className="right-col" style={{ flex: 1 }}>
                        <div className="search-row" style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
                            <input
                                ref={searchInputRef}
                                className="search-input"
                                placeholder="e.g. $.user.address.city or items[0].name"
                                style={{ flex: 1, padding: 8 }}
                            />
                            <button className="btn" onClick={() => handleSearch(searchInputRef.current.value)}>
                                Search
                            </button>
                        </div>
                        <button className="btn primary" onClick={handleGenerate} style={{ marginBottom: 10 }}>
                            Generate Tree
                        </button>
                        {error && <div className="error" style={{ color: error.startsWith('Invalid') ? '#d63031' : '#e67e22' }}>{error}</div>}
                        {searchMessage && <div className="info" style={{ color: '#0984e3' }}>{searchMessage}</div>}
                    </div>
                </div>
            </div>

            <div className="flow-area" style={{ flex: 1 }}>
                <ReactFlow
                    nodes={nodes}
                    edges={edges}
                    onNodesChange={onNodesChange}
                    onEdgesChange={onEdgesChange}
                    fitView
                    onInit={(inst) => (rfInstance.current = inst)}
                >
                    <MiniMap
                        nodeColor={(n) => (n.data.type === 'object' ? '#6c5ce7' : n.data.type === 'array' ? '#00b894' : '#fdcb6e')}
                    />
                    <Controls />
                    <Background gap={16} />
                </ReactFlow>
            </div>
        </div>
    )
}
