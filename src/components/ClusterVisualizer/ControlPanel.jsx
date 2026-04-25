// src/components/ClusterVisualizer/ControlPanel.jsx
import React, { useState } from 'react';
import { deployService, purgeCluster } from '../../services/api.js';

export default function ControlPanel({ setLogs }) {
    const [isDeploying, setIsDeploying] = useState(false);

    const handleDeploy = async (tech) => {
        setIsDeploying(true);
        setLogs(prev => [...prev, `[USER] Requested ${tech} deployment...`]);

        try {
            await deployService(tech);
            // We don't update the pod state here! We wait for the WebSocket
            // in Dashboard.jsx to tell us it actually happened.
        } catch (error) {
            setLogs(prev => [...prev, `[ERROR] Failed to deploy ${tech}.`]);
        } finally {
            setIsDeploying(false);
        }
    };

    const handlePurge = async () => {
        setLogs(prev => [...prev, `[USER] Initiating cluster purge...`]);
        try {
            await purgeCluster();
        } catch (error) {
            setLogs(prev => [...prev, `[ERROR] Failed to purge cluster.`]);
        }
    };

    return (
        <div className="control-panel" style={{ padding: '20px', backgroundColor: '#1e1e1e', borderRadius: '8px', marginBottom: '20px' }}>
            <h3 style={{ color: '#fff', marginTop: 0 }}>Command Center</h3>
            <div style={{ display: 'flex', gap: '10px' }}>
                <button disabled={isDeploying} onClick={() => handleDeploy('.NET')} style={btnStyle('#512bd4')}>
                    Deploy .NET Pod
                </button>
                <button disabled={isDeploying} onClick={() => handleDeploy('Node.js')} style={btnStyle('#339933')}>
                    Deploy Node.js Pod
                </button>
                <button disabled={isDeploying} onClick={() => handleDeploy('PHP')} style={btnStyle('#777bb4')}>
                    Deploy PHP Pod
                </button>
                <button onClick={handlePurge} style={btnStyle('#d9534f', true)}>
                    Purge Cluster
                </button>
            </div>
        </div>
    );
}

// Simple inline styling helper for the buttons
const btnStyle = (bgColor, isDanger = false) => ({
    backgroundColor: bgColor,
    color: 'white',
    padding: '10px 15px',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontWeight: 'bold',
    marginLeft: isDanger ? 'auto' : '0' // Pushes purge button to the right
});