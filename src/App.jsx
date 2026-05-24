import { useEffect, useState } from 'react';
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import { io } from 'socket.io-client';
import Header from './Header.jsx';
import Portfolio from './Portfolio.jsx';
import Projects from './Projects.jsx';
import HomCentralWidget from './components/ClusterVisualizer/HomCentralWidget.jsx';
import EvidenceApp from './evidence/EvidenceApp.jsx';

function HomCentralRoute() {
    const [flowStage, setFlowStage] = useState(0);
    const [pods, setPods] = useState([]);
    const [activeShard, setActiveShard] = useState(null);

    useEffect(() => {
        const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000';
        const fetchPods = async () => {
            try {
                const response = await fetch(`${API_BASE}/api/k8s/pods`, {
                    headers: { 'x-api-key': 'hom-central-secret-777' }
                });
                if (response.ok) {
                    const data = await response.json();
                    setPods(data);
                }
            } catch (err) {
                console.error("Failed to fetch K8s pods:", err);
            }
        };

        fetchPods();
        const socket = io(API_BASE, { transports: ['websocket'] });
        socket.on('K8S_CLUSTER_UPDATE', () => fetchPods());
        return () => socket.disconnect();
    }, []);

    return (
        <div className="max-w-6xl mx-auto p-6 pt-12">
            <HomCentralWidget
                flowStage={flowStage}
                setFlowStage={setFlowStage}
                pods={pods}
                activeShard={activeShard}
                setActiveShard={setActiveShard}
            />
        </div>
    );
}

export default function App() {
    const [darkTheme, setDarkTheme] = useState(() => {
        if (typeof window !== 'undefined') {
            const saved = localStorage.getItem('theme');
            if (saved !== null) return saved === 'dark';
        }
        return true;
    });

    useEffect(() => {
        const root = document.documentElement;

        if (darkTheme) {
            root.classList.add('dark');
            root.classList.remove('light');
            localStorage.setItem('theme', 'dark');
        } else {
            root.classList.add('light');
            root.classList.remove('dark');
            localStorage.setItem('theme', 'light');
        }
    }, [darkTheme]);

    return (
        <Router>
            <div className="min-h-screen transition-colors duration-300 bg-gray-50 dark:bg-[#0d1117] text-gray-900 dark:text-[#c9d1d9]">
                <Header darkTheme={darkTheme} setDarkTheme={setDarkTheme} />

                <main className="pt-16">
                    <Routes>
                        <Route path="/" element={<Portfolio />} />
                        <Route path="/projects" element={<Projects />} />
                        <Route path="/homcentral" element={<HomCentralRoute />} />
                        <Route path="/evidence/*" element={<EvidenceApp />} />
                    </Routes>
                </main>
            </div>
        </Router>
    );
}
