import React, { useCallback, useEffect, useRef, useState } from 'react'
import ReactFlow, {
    useNodesState,
    useEdgesState,
    MiniMap,
    Controls,
    Background,
} from 'reactflow'
import 'reactflow/dist/style.css'
import { toPng } from 'html-to-image'


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
    {"name": "item1"},
    {"name": "item2"}
  ]
}`

const NODE_WIDTH = 160
const NODE_HEIGHT = 48

function getNodeStyle(type, highlighted, darkMode) {
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
        color: darkMode ? '#f5f5f5' : '#333',
    }

    if (type === 'object') return { ...base, background: darkMode ? '#4b3f72' : '#6c5ce7' }
    if (type === 'array') return { ...base, background: darkMode ? '#218c74' : '#00b894' }
    return { ...base, background: darkMode ? '#b67b00' : '#fdcb6e' }
}

let idCounter = 1
const genId = () => `n_${idCounter++}`

function traverseToNodes(json, path = '$', depth = 0, x = 0, y = 0, nodes = [], edges = [], parentId = null, darkMode = false) {
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
            style: getNodeStyle(type, false, darkMode),
        })

        if (parentId)
            edges.push({ id: `e_${parentId}_${nodeId}`, source: parentId, target: nodeId })
    }

    if (type === 'object') {
        let childY = y
        for (const key of Object.keys(json)) {
            traverseToNodes(json[key], `${path === '$' ? '$' : path}.${key}`, isRoot ? depth : depth + 1, x, childY, nodes, edges, isRoot ? parentId : nodeId, darkMode)
            childY += 120
        }
    } else if (type === 'array') {
        let childY = y
        for (let i = 0; i < json.length; i++) {
            traverseToNodes(json[i], `${path}[${i}]`, isRoot ? depth : depth + 1, x, childY, nodes, edges, isRoot ? parentId : nodeId, darkMode)
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
    if (!(/\[\s*"(?:[^"\\]|\\.)*"\s*:/m.test(text))) return text

    return text.replace(/\[([^\[\]]*?"[^"\[\]]*?"\s*:\s*[^,\[\]]+(?:\s*,\s*"[^"\[\]]*?"\s*:\s*[^,\[\]]+)*)\]/gs, (match, inner) => {
        const parts = inner.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/).map(p => p.trim()).filter(Boolean)
        const keyValRegex = /^\s*"([^"]+)"\s*:\s*(.+)\s*$/s
        const allMatch = parts.every(p => keyValRegex.test(p))
        if (!allMatch) return match

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
    const [copyMessage, setCopyMessage] = useState('');
    const [jsonText, setJsonText] = useState(SAMPLE_JSON)
    const [error, setError] = useState('')
    const [searchMessage, setSearchMessage] = useState('')
    const [darkMode, setDarkMode] = useState(false)

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
                if (candidate === text) throw err
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
            const { nodes: newNodes, edges: newEdges } = traverseToNodes(parsed, '$', 0, 0, 0, [], [], null, darkMode)
            setNodes(newNodes)
            setEdges(newEdges)
            if (sanitized) {
                setError('Input was auto-sanitized (heuristic).')
                setJsonText(sanitizedText)
            } else setError('')
            setTimeout(() => {
                if (rfInstance.current?.fitView) rfInstance.current.fitView({ padding: 0.2 })
            }, 150)
        } catch (e) {
            setError(`Invalid JSON: ${e.message}`)
        }
    }, [jsonText, parseWithRecovery, darkMode, setNodes, setEdges])

    useEffect(() => {
        handleGenerate()
    }, [darkMode])

    const handleSearch = useCallback(
        (query) => {
            if (!query) return
            const normalized = parsePathToNormalized(query)
            if (!normalized) return
            const match = nodes.find((n) => n.data.path.endsWith(normalized) || n.data.path === '$.' + normalized)
            if (match) {
                const updated = nodes.map((n) => ({ ...n, style: getNodeStyle(n.data.type, n.id === match.id, darkMode) }))
                setNodes(updated)
                setSearchMessage('Match found')
                if (rfInstance.current?.setCenter) {
                    try {
                        rfInstance.current.setCenter(match.position.x + NODE_WIDTH / 2, match.position.y + NODE_HEIGHT / 2, { zoom: 1.3 })
                    } catch {
                        rfInstance.current.fitView && rfInstance.current.fitView({ padding: 0.2 })
                    }
                }
            } else {
                setSearchMessage('No match found')
            }
        },
        [nodes, setNodes, darkMode]
    )


    const handleNodeClick = useCallback((event, node) => {
        if (!node?.data?.path) return;
        navigator.clipboard.writeText(node.data.path)
            .then(() => {
                setCopyMessage(`Path copied: ${node.data.path}`);
                setTimeout(() => setCopyMessage(''), 2000);
            })
            .catch(() => {
                setCopyMessage('❌ Failed to copy path');
                setTimeout(() => setCopyMessage(''), 2000);
            });
    }, []);
    const appBg = darkMode ? '#1e1e1e' : '#f5f6fa'
    const textColor = darkMode ? '#f5f5f5' : '#2d3436'

    const handleDownloadImage = useCallback(() => {
        if (!rfInstance.current) return;
        const flow = rfInstance.current.getViewport();
        const reactFlowWrapper = document.querySelector('.react-flow__viewport') || document.querySelector('.react-flow');

        if (!reactFlowWrapper) {
            setError('❌ Unable to capture tree.');
            return;
        }

        toPng(reactFlowWrapper, {
            backgroundColor: darkMode ? '#121212' : '#ffffff',
            quality: 1.0,
            pixelRatio: 2,
        })
            .then((dataUrl) => {
                const link = document.createElement('a');
                link.download = 'json_tree_visualization.png';
                link.href = dataUrl;
                link.click();
            })
            .catch((err) => {
                console.error('Image download failed:', err);
                setError('❌ Failed to export image.');
            });
    }, [darkMode]);


    return (
        <div className="app-root" style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: appBg, color: textColor }}>
            <div className="panel" style={{ padding: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h2
                    className="title"
                    style={{
                        color: darkMode ? '#f5f6fa' : '#2d3436',
                        transition: 'color 0.3s ease',
                    }}
                >JSON Tree Visualizer</h2>
                <button
                    className="btn toggle"
                    onClick={() => setDarkMode((d) => !d)}
                    style={{
                        padding: '8px 16px',
                        background: darkMode ? '#555' : '#ddd',
                        color: darkMode ? '#ffffff' : '#333',
                        border: 'none',
                        borderRadius: 6,
                        cursor: 'pointer',
                    }}
                >
                    {darkMode ? '🌞 Light Mode' : '🌙 Dark Mode'}
                </button>
            </div>

            <div className="controls-row" style={{ display: 'flex', gap: 20, padding: 20 }}>
                <textarea
                    className="json-input"
                    value={jsonText}
                    onChange={(e) => setJsonText(e.target.value)}
                    style={{
                        width: '40%',
                        height: 300,
                        fontFamily: 'monospace',
                        padding: 10,
                        background: darkMode ? '#2b2b2b' : '#fff',
                        color: textColor,
                        border: '1px solid #555',
                        borderRadius: 6,
                    }}
                />
                <div className="right-col" style={{ flex: 1 }}>
                    <div className="search-row" style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
                        <input
                            ref={searchInputRef}
                            className="search-input"
                            placeholder="e.g. $.user.address.city or items[0].name"
                            style={{
                                flex: 1,
                                padding: 8,
                                background: darkMode ? '#2b2b2b' : '#fff',
                                color: textColor,
                                borderRadius: 6,
                                border: '1px solid #555',
                            }}
                        />
                        <button
                            className="btn"
                            onClick={() => handleSearch(searchInputRef.current.value)}
                            style={{
                                background: darkMode ? '#444' : '#eee',
                                color: darkMode ? '#fff' : '#000',
                                border: '1px solid #555',
                                borderRadius: 6,
                                padding: '8px 12px',
                                cursor: 'pointer',
                            }}
                        >
                            Search
                        </button>
                    </div>


                    <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
                        <button
                            className="btn primary"
                            onClick={handleGenerate}
                            style={{
                                background: darkMode ? '#6c5ce7' : '#0984e3',
                                color: '#fff',
                                border: 'none',
                                borderRadius: 6,
                                padding: '8px 16px',
                                cursor: 'pointer',
                            }}
                        >
                            Generate Tree
                        </button>

                        <button
                            className="btn secondary"
                            onClick={() => {
                                setJsonText('')
                                setNodes([])
                                setEdges([])
                                setError('')
                                setSearchMessage('')
                            }}
                            style={{
                                background: darkMode ? '#555' : '#ccc',
                                color: darkMode ? '#fff' : '#000',
                                border: 'none',
                                borderRadius: 6,
                                padding: '8px 16px',
                                cursor: 'pointer',
                            }}
                        >
                            Clear / Reset
                        </button>
                    </div>
                    <button
                        className="btn secondary"
                        onClick={handleDownloadImage}
                        style={{
                            background: darkMode ? '#2d3436' : '#74b9ff',
                            color: '#fff',
                            border: 'none',
                            borderRadius: 6,
                            padding: '8px 16px',
                            cursor: 'pointer',
                        }}
                    >
                        📸 Download Tree
                    </button>

                    {error && (
                        <div className="error" style={{ color: error.startsWith('Invalid') ? '#e74c3c' : '#e67e22' }}>
                            {error}
                        </div>
                    )}
                    {searchMessage && <div className="info" style={{ color: '#0984e3' }}>{searchMessage}</div>}
                </div>
            </div>

            {copyMessage && (
                <div
                    style={{
                        position: 'fixed',
                        bottom: 20,
                        left: '50%',
                        transform: 'translateX(-50%)',
                        background: darkMode ? '#2ecc71' : '#27ae60',
                        color: '#fff',
                        padding: '8px 16px',
                        borderRadius: 6,
                        boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
                        zIndex: 1000,
                        transition: 'opacity 0.3s ease',
                    }}
                >
                    ✅ {copyMessage}
                </div>
            )}


            <div className="flow-area" style={{ flex: 1 }}>
                <ReactFlow
                    nodes={nodes}
                    edges={edges}
                    onNodesChange={onNodesChange}
                    onEdgesChange={onEdgesChange}
                    onNodeClick={handleNodeClick}
                    fitView
                    onInit={(inst) => (rfInstance.current = inst)}
                    style={{ background: darkMode ? '#121212' : '#ffffff' }}
                >
                    <MiniMap
                        nodeColor={(n) =>
                            n.data.type === 'object'
                                ? darkMode ? '#4b3f72' : '#6c5ce7'
                                : n.data.type === 'array'
                                    ? darkMode ? '#218c74' : '#00b894'
                                    : darkMode ? '#b67b00' : '#fdcb6e'
                        }
                        style={{ background: darkMode ? '#333' : '#fafafa' }}
                    />
                    <Controls />
                    <Background gap={16} color={darkMode ? '#555' : '#ccc'} />
                </ReactFlow>
            </div>
        </div>
    )
}
