import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { io } from 'socket.io-client';
import Header from './Header.jsx';
import Portfolio from './Portfolio.jsx';
import Projects from './Projects.jsx';
import HomCentralWidget from './components/ClusterVisualizer/HomCentralWidget.jsx';

export default function App() {
    const [flowStage, setFlowStage] = useState(0);
    const [pods, setPods] = useState([]);
    const [activeShard, setActiveShard] = useState(null);

    // 🧠 1. INITIALIZE THEME: Absolute default is DARK
    const [darkTheme, setDarkTheme] = useState(() => {
        if (typeof window !== 'undefined') {
            const saved = localStorage.getItem('theme');
            // Check if there is a saved preference, otherwise default to true (dark)
            if (saved !== null) return saved === 'dark';
        }
        return true;
    });

    // 🧠 2. SYNC THE DOM & EMIT TELEMETRY
    useEffect(() => {
        const root = document.documentElement; // Targets the <html> node

        // 🚨 TELEMETRY: This prints to your browser console every time you click the button
        console.log("Theme Engine Fired! Target state:", darkTheme ? "DARK" : "LIGHT");

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

    // K8s Fetching Logic
    useEffect(() => {
        const fetchPods = async () => {
            try {
                const response = await fetch('http://localhost:3000/api/k8s/pods', {
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
        const socket = io('http://localhost:3000', { transports: ['websocket'] });
        socket.on('K8S_CLUSTER_UPDATE', () => fetchPods());
        return () => socket.disconnect();
    }, []);

    return (
        <Router>
            {/* Notice how clean this is now! No more wrapper divs for the theme. */}
            <div className="min-h-screen transition-colors duration-300 bg-gray-50 dark:bg-[#0d1117] text-gray-900 dark:text-[#c9d1d9]">

                <Header darkTheme={darkTheme} setDarkTheme={setDarkTheme} />

                <main className="pt-16">
                    <Routes>
                        <Route path="/" element={<Portfolio />} />
                        <Route path="/projects" element={<Projects />} />
                        <Route
                            path="/homcentral"
                            element={
                                <div className="max-w-6xl mx-auto p-6 pt-12">
                                    <HomCentralWidget
                                        flowStage={flowStage}
                                        setFlowStage={setFlowStage}
                                        pods={pods}
                                        activeShard={activeShard}
                                        setActiveShard={setActiveShard}
                                    />
                                </div>
                            }
                        />
                    </Routes>
                </main>
            </div>
        </Router>
    );
}