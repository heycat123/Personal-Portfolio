import React from 'react';
import { Link } from 'react-router-dom';
import { Sun, Moon, Settings, User } from 'lucide-react';

export default function Header({ darkTheme, setDarkTheme }) {
    return (
    <nav className="fixed w-full top-0 z-50 transition-colors duration-300 bg-white/80 dark:bg-[#0d1117]/80 backdrop-blur-md border-b border-gray-200 dark:border-[#30363d]">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">

            {/* LOGO & LINKS */}
            <div className="flex gap-8 items-center">
                {/* "Forest Lee" forces maximum contrast */}
                <Link to="/" className="text-gray-900 dark:text-white font-bold text-lg hover:text-[#58a6ff] dark:hover:text-[#58a6ff] transition-colors">
                    Forest Lee
                </Link>

                {/* Standard navigation links use softer grays */}
                <div className="hidden md:flex gap-6 text-sm font-medium">
                    <Link to="/" className="text-gray-600 dark:text-[#8b949e] hover:text-gray-900 dark:hover:text-white transition-colors">
                        Home
                    </Link>
                    <Link to="/projects" className="text-gray-600 dark:text-[#8b949e] hover:text-gray-900 dark:hover:text-white transition-colors">
                        Projects
                    </Link>
                </div>
            </div>

            {/* CONTROLS & AUTH */}
            <div className="flex items-center gap-4">

                {/* 🚀 THE MASTER TOGGLE SWITCH */}
                <button
                    onClick={() => setDarkTheme(!darkTheme)}
                    className="p-2 text-gray-600 dark:text-[#8b949e] hover:bg-gray-100 dark:hover:bg-[#30363d] rounded-md transition-colors"
                    aria-label="Toggle Theme"
                >
                    {darkTheme ? <Sun size={18} /> : <Moon size={18} />}
                </button>

                <button className="p-2 text-gray-600 dark:text-[#8b949e] hover:bg-gray-100 dark:hover:bg-[#30363d] rounded-md transition-colors">
                    <Settings size={18} />
                </button>

                <button className="bg-[#238636] hover:bg-[#2ea043] text-white flex items-center gap-2 px-4 py-2 rounded-md text-sm font-semibold transition-colors shadow-sm">
                    <User size={16} /> Sign Up
                </button>
            </div>
        </div>
    </nav>
    );
}