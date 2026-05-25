import { Activity, Code, Database, Scale, Server, Settings } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function Projects() {
  return (
    <div className="min-h-screen p-8 pt-20 transition-colors duration-300">
      <div className="mx-auto max-w-5xl">
        <div className="mb-12 flex items-center justify-between">
          <h1 className="text-4xl font-bold text-gray-900 transition-colors duration-300 dark:text-white">Engineering Portfolio</h1>
          <Link to="/" className="text-gray-500 transition-colors hover:text-gray-900 dark:text-[#8b949e] dark:hover:text-white">
            Back to Home
          </Link>
        </div>

        <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
          <Link to="/homcentral" className="group flex h-full flex-col rounded-xl border border-gray-200 bg-white p-6 transition-all duration-300 hover:border-[#58a6ff] hover:shadow-[0_0_20px_rgba(88,166,255,0.15)] dark:border-[#30363d] dark:bg-[#161b22] dark:hover:border-[#58a6ff]">
            <div className="mb-4 flex gap-3">
              <Server className="text-[#58a6ff]" size={24} />
              <Database className="text-[#3fb950]" size={24} />
            </div>
            <h3 className="mb-2 text-xl font-bold text-gray-900 transition-colors group-hover:text-[#58a6ff] dark:text-white">HomCentral Dispatch</h3>
            <p className="mb-6 flex-grow text-sm text-gray-600 transition-colors dark:text-[#8b949e]">
              A maintenance dispatch system featuring real-time data sharding and Kubernetes infrastructure observability.
            </p>
            <div className="rounded border border-gray-200 bg-gray-50 px-3 py-2 text-center font-mono text-xs text-[#58a6ff] transition-colors group-hover:bg-[#58a6ff] group-hover:text-white dark:border-[#30363d] dark:bg-[#0d1117] dark:group-hover:text-[#0d1117]">
              Launch Interactive Dashboard
            </div>
          </Link>

          <div className="group flex h-full flex-col rounded-xl border border-gray-200 bg-white p-6 transition-all duration-300 hover:border-[#3fb950] dark:border-[#30363d] dark:bg-[#161b22] dark:hover:border-[#3fb950]">
            <div className="mb-4 flex gap-3">
              <Settings className="text-[#3fb950]" size={24} />
              <Activity className="text-[#e3b341]" size={24} />
            </div>
            <h3 className="mb-2 text-xl font-bold text-gray-900 transition-colors dark:text-white">OET Kiosk Platform</h3>
            <p className="mb-6 flex-grow text-sm text-gray-600 transition-colors dark:text-[#8b949e]">
              Power Platform enterprise tool with integrated GitHub version control and environment governance.
            </p>
            <div className="flex gap-2">
              <span className="rounded bg-gray-100 px-2 py-1 text-[10px] font-bold uppercase text-gray-500 transition-colors dark:bg-[#21262d] dark:text-[#8b949e]">Power Apps</span>
              <span className="rounded bg-gray-100 px-2 py-1 text-[10px] font-bold uppercase text-gray-500 transition-colors dark:bg-[#21262d] dark:text-[#8b949e]">Environment ALM</span>
            </div>
          </div>

          <div className="group flex h-full flex-col rounded-xl border border-gray-200 bg-white p-6 transition-all duration-300 hover:border-[#e3b341] dark:border-[#30363d] dark:bg-[#161b22] dark:hover:border-[#e3b341]">
            <div className="mb-4 flex gap-3">
              <Code className="text-[#e3b341]" size={24} />
            </div>
            <h3 className="mb-2 text-xl font-bold text-gray-900 transition-colors dark:text-white">Industrial IIoT Pipeline</h3>
            <p className="mb-6 flex-grow text-sm text-gray-600 transition-colors dark:text-[#8b949e]">
              "Shop Floor to Top Floor" integration utilizing MTConnect protocols to stream real-time CNC telemetry into SQL.
            </p>
            <div className="flex gap-2">
              <span className="rounded bg-gray-100 px-2 py-1 text-[10px] font-bold uppercase text-gray-500 transition-colors dark:bg-[#21262d] dark:text-[#8b949e]">MTConnect</span>
              <span className="rounded bg-gray-100 px-2 py-1 text-[10px] font-bold uppercase text-gray-500 transition-colors dark:bg-[#21262d] dark:text-[#8b949e]">Python (Pandas)</span>
            </div>
          </div>

          <a href="/evidence" target="_blank" rel="noreferrer" className="group flex h-full flex-col rounded-xl border border-gray-200 bg-white p-6 transition-all duration-300 hover:border-[#f0883e] dark:border-[#30363d] dark:bg-[#161b22] dark:hover:border-[#f0883e]">
            <div className="mb-4 flex gap-3">
              <Scale className="text-[#f0883e]" size={24} />
            </div>
            <h3 className="mb-2 text-xl font-bold text-gray-900 transition-colors dark:text-white">Legal Evidence Classification</h3>
            <p className="mb-6 flex-grow text-sm text-gray-600 transition-colors dark:text-[#8b949e]">
              AI-assisted evidence ingestion and legal case workflow app with document upload, validation, and job tracking.
            </p>
            <div className="rounded border border-gray-200 bg-gray-50 px-3 py-2 text-center font-mono text-xs text-[#f0883e] transition-colors group-hover:bg-[#f0883e] group-hover:text-white dark:border-[#30363d] dark:bg-[#0d1117] dark:group-hover:text-[#0d1117]">
              Open Evidence Workspace
            </div>
          </a>
        </div>
      </div>
    </div>
  );
}
