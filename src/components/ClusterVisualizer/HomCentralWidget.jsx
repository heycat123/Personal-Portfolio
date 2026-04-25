import React, { useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import SystemFlow from './SystemFlow.jsx';
import ClusterGrid from './ClusterGrid.jsx';

export default function HomCentralWidget({ flowStage, setFlowStage, pods, activeShard, setActiveShard }) {
    const [tickets, setTickets] = useState([]);
    const [ticketStatus, setTicketStatus] = useState(null);
    const [propertyId, setPropertyId] = useState('12345');
    const [issueDescription, setIssueDescription] = useState('Broken Pipe');

    // 🚀 NEW: State for Redis Toggle and Performance Metrics
    const [useCache, setUseCache] = useState(true);
    const [fetchMetrics, setFetchMetrics] = useState({ source: 'pending', time: 0 });

    const API_BASE = "http://localhost:3000";

    const fetchAllTickets = async () => {
        try {
            // 🚀 UPDATED: Append the useCache toggle to the URL
            const response = await fetch(`${API_BASE}/api/tickets?useCache=${useCache}`, {
                headers: { 'x-api-key': 'hom-central-secret-777' }
            });

            if (!response.ok) throw new Error(`API Error: ${response.status}`);

            const result = await response.json();

            // 🚀 UPDATED: Handle the new metrics object format we will build in Node.js
            if (Array.isArray(result)) {
                setTickets(result);
            } else {
                setTickets(result.data || []);
                setFetchMetrics({ source: result.source, time: result.timeMs });
            }
        } catch (err) {
            console.error("Fetch error:", err.message);
        }
    };

    useEffect(() => {
        fetchAllTickets();

        const socket = io(API_BASE, {
            transports: ['websocket'],
            upgrade: false,
            reconnection: true
        });

        socket.on('TICKET_UPDATED', () => {
            console.log("⚡ .NET Worker finished! Refreshing table...");
            fetchAllTickets();
        });

        return () => socket.disconnect();
    }, [useCache]); // 👈 Added useCache to dependency array so it fetches using the latest state

    const submitMaintenanceTicket = async () => {
        const targetShard = propertyId.startsWith('5') ? 'B' : 'A';
        setActiveShard(targetShard);

        setFlowStage(1);
        setTicketStatus("Sending to API Gateway...");

        try {
            const response = await fetch(`${API_BASE}/api/jobs/request`, {
                method: 'POST',
                headers: {
                    'x-api-key': 'hom-central-secret-777',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    propertyId: propertyId,
                    issueType: issueDescription,
                    timestamp: new Date().toISOString()
                })
            });

            if (!response.ok) throw new Error(`API Error: ${response.status}`);

            const json = await response.json();
            setFlowStage(2);
            setTicketStatus(`✅ Queued in RabbitMQ: ${json.ticketId}`);

            setTimeout(() => {
                setFlowStage(3);
                setTicketStatus("⚙️ .NET Worker picking up job...");
            }, 1000);

            setTimeout(() => {
                setFlowStage(4);
                setTicketStatus(`🎉 Success: Persisted to Shard ${targetShard}`);
                setIssueDescription('');
            }, 2200);

            setTimeout(() => {
                setFlowStage(0);
                setActiveShard(null);
            }, 6000);

        } catch (err) {
            setFlowStage(0);
            setActiveShard(null);
            setTicketStatus(`❌ Failed: ${err.message}`);
        }
    };

    const inputStyle = {
        backgroundColor: '#0d1117',
        border: '1px solid #30363d',
        borderRadius: '6px',
        color: '#c9d1d9',
        padding: '10px',
        marginRight: '10px',
        fontSize: '0.9rem',
        outline: 'none'
    };

    return (
        <div style={{ backgroundColor: '#161b22', borderRadius: '8px', padding: '25px', color: '#c9d1d9', border: '1px solid #30363d' }}>
            <h2 style={{ color: '#58a6ff', marginTop: 0, marginBottom: '20px' }}>Maintenance Dispatch Center</h2>

            <SystemFlow currentStage={flowStage} />

            <div style={{ marginBottom: '30px' }}>
                <h3 style={{ color: '#8b949e', fontSize: '0.9rem', marginBottom: '10px' }}>Live Kubernetes Visualizer</h3>
                <ClusterGrid pods={pods} flowStage={flowStage} activeShard={activeShard} />
            </div>

            <div style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: '15px',
                marginBottom: '25px',
                alignItems: 'flex-end',
                padding: '20px',
                backgroundColor: '#0d1117',
                borderRadius: '8px',
                border: '1px solid #30363d'
            }}>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <label style={{ fontSize: '0.75rem', color: '#8b949e', marginBottom: '6px' }}>Property ID (Starts with 5 = Shard B)</label>
                    <input
                        style={inputStyle}
                        value={propertyId}
                        onChange={(e) => setPropertyId(e.target.value)}
                        placeholder="e.g. 55555"
                    />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                    <label style={{ fontSize: '0.75rem', color: '#8b949e', marginBottom: '6px' }}>Emergency Issue</label>
                    <input
                        style={{ ...inputStyle, width: '100%' }}
                        value={issueDescription}
                        onChange={(e) => setIssueDescription(e.target.value)}
                        placeholder="What needs fixing?"
                    />
                </div>

                <button
                    onClick={submitMaintenanceTicket}
                    disabled={flowStage !== 0}
                    style={{
                        backgroundColor: flowStage !== 0 ? '#30363d' : '#da3633',
                        color: '#fff',
                        padding: '11px 25px',
                        borderRadius: '6px',
                        cursor: flowStage !== 0 ? 'not-allowed' : 'pointer',
                        fontWeight: 'bold',
                        border: 'none',
                        transition: 'background-color 0.3s'
                    }}
                >
                    🚨 {flowStage !== 0 ? 'Processing...' : 'Dispatch Ticket'}
                </button>
            </div>

            {/* 🚀 NEW: The Redis Toggle and Metrics UI */}
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '15px',
                padding: '12px 15px',
                backgroundColor: '#0d1117',
                borderRadius: '6px',
                border: '1px solid #30363d'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                    <span style={{ fontSize: '0.85rem', fontWeight: 'bold', color: '#8b949e' }}>Data Strategy:</span>

                    <button
                        onClick={() => {
                            setUseCache(!useCache);
                        }}
                        style={{
                            backgroundColor: useCache ? '#238636' : '#21262d',
                            color: '#c9d1d9',
                            border: `1px solid ${useCache ? '#2ea043' : '#30363d'}`,
                            padding: '6px 12px',
                            borderRadius: '20px',
                            cursor: 'pointer',
                            fontSize: '0.8rem',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            transition: 'all 0.2s'
                        }}
                    >
                        {useCache ? '⚡ Redis Cache ENABLED' : '🗄️ Direct DB Query'}
                    </button>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                    {fetchMetrics.source !== 'pending' && (
                        <div style={{
                            fontSize: '0.85rem',
                            color: fetchMetrics.source === 'Redis' ? '#e3b341' : '#58a6ff',
                            fontFamily: 'monospace',
                            backgroundColor: '#161b22',
                            padding: '4px 10px',
                            borderRadius: '4px',
                            border: '1px solid #30363d'
                        }}>
                            Served from {fetchMetrics.source} in <b>{fetchMetrics.time.toFixed(2)}ms</b>
                        </div>
                    )}

                    <button onClick={fetchAllTickets} style={{ color: '#8b949e', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.85rem', padding: 0 }}>
                        🔄 Refresh
                    </button>
                </div>
            </div>

            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                <thead>
                <tr style={{ textAlign: 'left', borderBottom: '2px solid #30363d', color: '#8b949e' }}>
                    <th style={{ padding: '12px' }}>Property</th>
                    <th style={{ padding: '12px' }}>Issue</th>
                    <th style={{ padding: '12px' }}>Shard Source</th>
                </tr>
                </thead>
                <tbody>
                {tickets.length === 0 ? (
                    <tr><td colSpan="3" style={{ textAlign: 'center', padding: '30px', color: '#8b949e' }}>No tickets processed yet.</td></tr>
                ) : (
                    tickets.map((t, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid #30363d' }}>
                            <td style={{ padding: '12px', fontFamily: 'monospace' }}>{t.PropertyId || t.propertyid}</td>
                            <td style={{ padding: '12px' }}>{t.IssueType || t.issuetype}</td>
                            <td style={{ padding: '12px' }}>
                                    <span style={{
                                        backgroundColor: (t.source === 'Shard A' || t.source === 'shard_a') ? '#238636' : '#8957e5',
                                        padding: '3px 10px',
                                        borderRadius: '12px',
                                        fontSize: '0.75rem',
                                        fontWeight: 'bold'
                                    }}>
                                        {t.source}
                                    </span>
                            </td>
                        </tr>
                    ))
                )}
                </tbody>
            </table>
        </div>
    );
}