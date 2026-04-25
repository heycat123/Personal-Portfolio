import React, { useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import EventLog from './EventLog.jsx';
import HomCentralWidget from './HomCentralWidget';
// ☝️ Notice we don't need to import SystemFlow or ClusterGrid here anymore!

export default function Dashboard() {
    const [activePods, setActivePods] = useState([]);
    const [logs, setLogs] = useState(["System initialized. Waiting for dispatch..."]);
    const [flowStage, setFlowStage] = useState(0);
    const [activeShard, setActiveShard] = useState(null);

    const API_BASE = "http://localhost:3000";

    const fetchPods = async () => {
        try {
            const res = await fetch(`${API_BASE}/api/k8s/pods`, {
                headers: { 'x-api-key': 'hom-central-secret-777' }
            });
            const data = await res.json();
            setActivePods(data);
        } catch (err) {
            console.error("Failed to fetch pods:", err);
            setLogs(prev => [`❌ Error connecting to K8s API`, ...prev]);
        }
    };

    useEffect(() => {
        fetchPods();
        const socket = io(API_BASE, { transports: ['websocket'], upgrade: false });

        socket.on('K8S_CLUSTER_UPDATE', () => {
            fetchPods();
            setLogs(prev => [`🔄 Cluster state synchronized`, ...prev]);
        });

        socket.on('TICKET_UPDATED', () => {
            setLogs(prev => [`✅ Ticket successfully persisted to database`, ...prev]);
        });

        return () => socket.disconnect();
    }, []);

    useEffect(() => {
        if (flowStage === 1) setLogs(prev => [`⚡ Request hitting API Gateway...`, ...prev]);
        if (flowStage === 2) setLogs(prev => [`🐇 Message queued in RabbitMQ`, ...prev]);
        if (flowStage === 3) setLogs(prev => [`⚙️ .NET Worker processing job...`, ...prev]);
        if (flowStage === 4) setLogs(prev => [`🗄️ Data saved to Shard ${activeShard || ''}`, ...prev]);
    }, [flowStage, activeShard]);

    return (
        <div className="dashboard-container" style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto' }}>

            {/* We pass all 5 props down to the Widget so it can do the heavy lifting */}
            <HomCentralWidget
                flowStage={flowStage}
                setFlowStage={setFlowStage}
                pods={activePods}
                activeShard={activeShard}
                setActiveShard={setActiveShard}
            />

            <div style={{ marginTop: '30px' }}>
                <EventLog logs={logs} />
            </div>
        </div>
    );
}