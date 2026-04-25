import React from 'react';
import { Server, Database, Settings, Activity, Code } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function Projects() {
    return (
    <div className="min-h-screen p-8 pt-20 transition-colors duration-300">
        <div className="max-w-5xl mx-auto">
            <div className="flex items-center justify-between mb-12">
                {/* 🔄 CHANGED: text-gray-900 dark:text-white */}
                <h1 className="text-4xl font-bold text-gray-900 dark:text-white transition-colors duration-300">Engineering Portfolio</h1>
                <Link to="/" className="text-gray-500 dark:text-[#8b949e] hover:text-gray-900 dark:hover:text-white transition-colors">← Back to Home</Link>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
                {/* Project 1: HomCentral - The Interactive Tile */}
                {/* 🔄 CHANGED: bg-white dark:bg-[#161b22] and border responsive classes */}
                <Link to="/homcentral" className="group block bg-white dark:bg-[#161b22] border border-gray-200 dark:border-[#30363d] rounded-xl p-6 hover:border-[#58a6ff] dark:hover:border-[#58a6ff] hover:shadow-[0_0_20px_rgba(88,166,255,0.15)] transition-all duration-300 flex flex-col h-full">
                    <div className="flex gap-3 mb-4">
                        <Server className="text-[#58a6ff]" size={24} />
                        <Database className="text-[#3fb950]" size={24} />
                    </div>
                    {/* 🔄 CHANGED: text-gray-900 dark:text-white */}
                    <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2 group-hover:text-[#58a6ff] transition-colors">HomCentral Dispatch</h3>
                    <p className="text-gray-600 dark:text-[#8b949e] text-sm mb-6 flex-grow transition-colors">
                        A maintenance dispatch system featuring real-time data sharding and Kubernetes infrastructure observability.
                    </p>
                    <div className="text-xs font-mono text-[#58a6ff] bg-gray-50 dark:bg-[#0d1117] border border-gray-200 dark:border-[#30363d] py-2 px-3 rounded text-center group-hover:bg-[#58a6ff] group-hover:text-white dark:group-hover:text-[#0d1117] transition-colors">
                        Launch Interactive Dashboard →
                    </div>
                </Link>

                {/* Project 2: OET Kiosk (Enterprise Automation) */}
                {/* 🔄 CHANGED: bg-white dark:bg-[#161b22] */}
                <div className="group bg-white dark:bg-[#161b22] border border-gray-200 dark:border-[#30363d] rounded-xl p-6 hover:border-[#3fb950] dark:hover:border-[#3fb950] transition-all duration-300 flex flex-col h-full">
                    <div className="flex gap-3 mb-4">
                        <Settings className="text-[#3fb950]" size={24} />
                        <Activity className="text-[#e3b341]" size={24} />
                    </div>
                    <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2 transition-colors">OET Kiosk Platform</h3>
                    <p className="text-gray-600 dark:text-[#8b949e] text-sm mb-6 flex-grow transition-colors">
                        Power Platform enterprise tool with integrated GitHub version control and environment governance.
                    </p>
                    <div className="flex gap-2">
                        <span className="text-[10px] uppercase font-bold text-gray-500 dark:text-[#8b949e] bg-gray-100 dark:bg-[#21262d] px-2 py-1 rounded transition-colors">Power Apps</span>
                        <span className="text-[10px] uppercase font-bold text-gray-500 dark:text-[#8b949e] bg-gray-100 dark:bg-[#21262d] px-2 py-1 rounded transition-colors">Environment ALM</span>
                    </div>
                </div>

                {/* Project 3: CNC Telemetry Pipeline */}
                {/* 🔄 CHANGED: bg-white dark:bg-[#161b22] */}
                <div className="group bg-white dark:bg-[#161b22] border border-gray-200 dark:border-[#30363d] rounded-xl p-6 hover:border-[#e3b341] dark:hover:border-[#e3b341] transition-all duration-300 flex flex-col h-full">
                    <div className="flex gap-3 mb-4">
                        <Code className="text-[#e3b341]" size={24} />
                    </div>
                    <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2 transition-colors">Industrial IIoT Pipeline</h3>
                    <p className="text-gray-600 dark:text-[#8b949e] text-sm mb-6 flex-grow transition-colors">
                        "Shop Floor to Top Floor" integration utilizing MTConnect protocols to stream real-time CNC telemetry into SQL.
                    </p>
                    <div className="flex gap-2">
                        <span className="text-[10px] uppercase font-bold text-gray-500 dark:text-[#8b949e] bg-gray-100 dark:bg-[#21262d] px-2 py-1 rounded transition-colors">MTConnect</span>
                        <span className="text-[10px] uppercase font-bold text-gray-500 dark:text-[#8b949e] bg-gray-100 dark:bg-[#21262d] px-2 py-1 rounded transition-colors">Python (Pandas)</span>
                    </div>
                </div>
            </div>
        </div>
    </div>
);
}