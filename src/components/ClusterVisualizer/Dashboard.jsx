import { useCallback, useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import EventLog from './EventLog.jsx';
import HomCentralWidget from './HomCentralWidget';

export default function Dashboard() {
    const [activePods, setActivePods] = useState([]);
    const [logs, setLogs] = useState(["System initialized. Waiting for dispatch..."]);
    const [flowStage, setFlowStage] = useState(0);
    const [activeShard, setActiveShard] = useState(null);

    const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3000";

    const fetchPods = useCallback(async () => {
        try {
            const res = await fetch(`${API_BASE}/api/k8s/pods`, {
                headers: { 'x-api-key': 'hom-central-secret-777' }
            });
            const data = await res.json();
            setActivePods(data);
        } catch (err) {
            console.error("Failed to fetch pods:", err);
            setLogs(prev => [`Error connecting to K8s API`, ...prev]);
        }
    }, [API_BASE]);

    useEffect(() => {
        const timerId = window.setTimeout(() => {
            fetchPods();
        }, 0);
        const socket = io(API_BASE, { transports: ['websocket'], upgrade: false });

        socket.on('K8S_CLUSTER_UPDATE', () => {
            fetchPods();
            setLogs(prev => [`Cluster state synchronized`, ...prev]);
        });

        socket.on('TICKET_UPDATED', () => {
            setLogs(prev => [`Ticket successfully persisted to database`, ...prev]);
        });

        return () => {
            window.clearTimeout(timerId);
            socket.disconnect();
        };
    }, [API_BASE, fetchPods]);

    useEffect(() => {
        const messages = {
            1: 'Request hitting API Gateway...',
            2: 'Message queued in RabbitMQ',
            3: '.NET Worker processing job...',
            4: `Data saved to Shard ${activeShard || ''}`,
        };
        const message = messages[flowStage];
        if (!message) {
            return undefined;
        }

        const timerId = window.setTimeout(() => {
            setLogs(prev => [message, ...prev]);
        }, 0);

        return () => window.clearTimeout(timerId);
    }, [flowStage, activeShard]);

    return (
        <div className="dashboard-container" style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto' }}>
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
