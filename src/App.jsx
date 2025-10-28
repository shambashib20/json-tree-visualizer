import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ReactFlow, {
    useNodesState,
    useEdgesState,
    MiniMap,
    Controls,
    Background,
} from 'reactflow'
import 'reactflow/dist/style.css'
import clsx from 'clsx'


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
{ "name": "item1", "price": 9.99 },
{ "name": "item2", "price": 4.5 }
],
"active": true,
"count": null
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
        border: highlighted ? '2px solid #ff9800' : '1px solid rgba(0,0,0,0.08)'
    }
    if (type === 'object') return { ...base, background: '#6c5ce7', color: 'white' }
    if (type === 'array') return { ...base, background: '#00b894', color: 'white' }
    return { ...base, background: '#fdcb6e', color: '#333' }
}

let idCounter = 1
const genId = () => `n_${idCounter++}`


function traverseToNodes(json, path = '$', depth = 0, x = 0, y = 0, nodes = [], edges = [], parentId = null) {
    const nodeId = genId()
    const type = Array.isArray(json) ? 'array' : (json !== null && typeof json === 'object' ? 'object' : 'primitive')


    const label = (() => {
        if (type === 'object') return path.split('.').slice(-1)[0] === '$' ? 'root' : path.split('.').slice(-1)[0]
        if (type === 'array') return path.split('.').slice(-1)[0]
        return `${path.split('.').slice(-1)[0]}: ${String(json)}`
    })()


    nodes.push({ id: nodeId, data: { label, path, value: json, type }, position: { x: x + depth * 220, y: y }, style: getNodeStyle(type, false) })


    if (parentId) edges.push({ id: `e_${parentId}_${nodeId}`, source: parentId, target: nodeId })


    if (type === 'object') {
        let childY = y
        for (const key of Object.keys(json)) {
            traverseToNodes(json[key], `${path}.${key}`, depth + 1, x, childY, nodes, edges, nodeId)
            childY += 120
        }
    } else if (type === 'array') {
        let childY = y
        for (let i = 0; i < json.length; i++) {
            traverseToNodes(json[i], `${path}[${i}]`, depth + 1, x, childY, nodes, edges, nodeId)
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

export default function App() {
    const [searchMessage, setSearchMessage] = useState('')
    const rfInstance = useRef(null)


    const handleGenerate = useCallback(() => {
        setError('')
        idCounter = 1
        try {
            const parsed = JSON.parse(jsonText)
            const { nodes: newNodes, edges: newEdges } = traverseToNodes(parsed)
            setNodes(newNodes)
            setEdges(newEdges)
            setTimeout(() => {
                if (rfInstance.current) rfInstance.current.fitView({ padding: 0.2 })
            }, 150)
        } catch (e) {
            setError(e.message)
        }
    }, [jsonText])


    useEffect(() => { handleGenerate() }, [])


    const handleSearch = useCallback((query) => {
        if (!query) return
        const normalized = parsePathToNormalized(query)
        if (!normalized) return
        const match = nodes.find(n => n.data.path.endsWith(normalized) || n.data.path === '$.' + normalized)
        if (match) {
            const updated = nodes.map(n => ({ ...n, style: getNodeStyle(n.data.type, n.id === match.id) }))
            setNodes(updated)
            setSearchMessage('Match found')
            if (rfInstance.current) {
                rfInstance.current.setCenter(match.position.x + NODE_WIDTH / 2, match.position.y + NODE_HEIGHT / 2, { zoom: 1.3 })
            }
        } else {
            setSearchMessage('No match found')
        }
    }, [nodes])


    const searchInputRef = useRef(null)


    return (
        <div className="app-root">
            <div className="panel">
                <h2 className="title">JSON Tree Visualizer</h2>
                <div className="controls-row">
                    <textarea className="json-input" value={jsonText} onChange={(e) => setJsonText(e.target.value)} />
                    <div className="right-col">
                        <div className="search-row">
                            <input ref={searchInputRef} className="search-input" placeholder="e.g. $.user.address.city or items[0].name" />
                            <button className="btn" onClick={() => handleSearch(searchInputRef.current.value)}>Search</button>
                        </div>
                        <button className="btn primary" onClick={handleGenerate}>Generate Tree</button>
                        {error && <div className="error">Invalid JSON: {error}</div>}
                        {searchMessage && <div className="info">{searchMessage}</div>}
                    </div>
                </div>
                <div className="flow-area">
                    <ReactFlow
                        nodes={nodes}
                        edges={edges}
                        onNodesChange={onNodesChange}
                        onEdgesChange={onEdgesChange}
                        fitView
                        onInit={(inst) => (rfInstance.current = inst)}
                    >
                        <MiniMap nodeColor={(n) => n.data.type === 'object' ? '#6c5ce7' : n.data.type === 'array' ? '#00b894' : '#fdcb6e'} />
                        <Controls />
                        <Background gap={16} />
                    </ReactFlow>
                </div>
            </div>
        </div>
    )
}