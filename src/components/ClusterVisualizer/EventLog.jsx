// src/components/ClusterVisualizer/EventLog.jsx
import React, { useEffect, useRef } from 'react';

export default function EventLog({ logs }) {
    const logEndRef = useRef(null);

    // Auto-scroll to bottom whenever logs change
    // useEffect(() => {
    //     logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    // }, [logs]);

    return (
        <div className="event-log" style={{ marginTop: '20px' }}>
            <h3 style={{ color: '#333' }}>System Logs</h3>
            <div style={{
                backgroundColor: '#000',
                color: '#00ff00',
                fontFamily: 'monospace',
                padding: '15px',
                borderRadius: '8px',
                height: '200px',
                overflowY: 'auto',
                boxShadow: 'inset 0 0 10px rgba(0,0,0,0.8)'
            }}>
                {logs.length === 0 && <span style={{ color: '#555' }}>Waiting for events...</span>}

                {logs.map((log, index) => (
                    <div key={index} style={{ marginBottom: '4px' }}>
                        <span style={{ color: '#888' }}>[{new Date().toLocaleTimeString()}]</span> {log}
                    </div>
                ))}

                {/* An invisible div used as a target for auto-scrolling */}
                <div ref={logEndRef} />
            </div>
        </div>
    );
}