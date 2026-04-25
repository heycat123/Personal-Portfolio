import React, { useState, useEffect } from 'react';
import { Terminal, Mail, FileText, Download } from 'lucide-react';
import { FaLinkedin, FaGithub } from 'react-icons/fa';
import { SiIndeed } from 'react-icons/si';
import { Link } from 'react-router-dom';

export default function Portfolio() {
    const titles = ["Systems Engineer.", "Full Stack Developer.", "Automation Architect.", "B.S. Computer Science."];
    const [typedText, setTypedText] = useState("");
    const [titleIndex, setTitleIndex] = useState(0);
    const [charIndex, setCharIndex] = useState(0);
    const [isDeleting, setIsDeleting] = useState(false);
    const [typingSpeed, setTypingSpeed] = useState(150);

    useEffect(() => {
        const handleType = () => {
            const currentTitle = titles[titleIndex];
            if (isDeleting) {
                setTypedText(currentTitle.substring(0, charIndex - 1));
                setCharIndex(prev => prev - 1);
                setTypingSpeed(50);
            } else {
                setTypedText(currentTitle.substring(0, charIndex + 1));
                setCharIndex(prev => prev + 1);
                setTypingSpeed(150);
            }

            if (!isDeleting && charIndex === currentTitle.length) {
                setTimeout(() => setIsDeleting(true), 2000);
            } else if (isDeleting && charIndex === 0) {
                setIsDeleting(false);
                setTitleIndex((prev) => (prev + 1) % titles.length);
            }
        };
        const timer = setTimeout(handleType, typingSpeed);
        return () => clearTimeout(timer);
    }, [charIndex, isDeleting, titleIndex]);

    return (
        <div className="font-sans pb-20 antialiased selection:bg-[#58a6ff] selection:text-white transition-colors duration-300">

            {/* --- HERO SECTION --- */}
            <header className="max-w-5xl mx-auto px-6 pt-24 pb-20 border-b border-gray-200 dark:border-[#30363d] relative overflow-hidden transition-colors duration-300">
                <div className="absolute top-0 right-0 w-96 h-96 bg-[#58a6ff]/5 rounded-full blur-3xl pointer-events-none"></div>

                <div className="flex flex-col md:flex-row items-center gap-10">
                    <div className="relative group shrink-0">
                        <div className="absolute inset-0 bg-gradient-to-r from-[#58a6ff] to-[#3fb950] rounded-full blur-xl opacity-0 group-hover:opacity-30 transition-opacity duration-300"></div>
                        <img
                            src="../public/forest.jpg"
                            alt="Profile Photo"
                            className="object-top relative w-40 h-40 md:w-48 md:h-48 rounded-full border-4 border-gray-200 dark:border-[#30363d] group-hover:border-[#58a6ff] object-cover filter grayscale hover:grayscale-0 transition-all duration-300 ease-in-out shadow-2xl"
                            onError={(e) => {
                                e.target.onerror = null;
                                e.target.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' fill='%23161b22'/%3E%3Ccircle cx='50' cy='40' r='20' fill='%2330363d'/%3E%3Cpath d='M20,80 C20,60 80,60 80,80' stroke='%2330363d' stroke-width='5' fill='%2330363d'/%3E%3C/svg%3E";
                            }}
                        />
                    </div>

                    <div>
                        <h1 className="text-5xl md:text-6xl font-extrabold tracking-tight mb-6 text-gray-900 dark:text-white min-h-[140px] md:min-h-0 leading-tight transition-colors duration-300">
                            Hi, I'm Forest. <br />
                            I am a <span className="text-[#58a6ff]">{typedText}</span>
                            <span className="inline-block w-[5px] h-[0.9em] bg-[#58a6ff] animate-pulse ml-1 align-[-0.1em]"></span>
                        </h1>
                        <p className="text-xl text-gray-600 dark:text-[#8b949e] max-w-2xl leading-relaxed mb-10 transition-colors duration-300">
                            Systems Engineer based in the Twin Cities. I turn complex telemetry into actionable, real-time insights by bridging the gap between industrial automation and enterprise full-stack development.
                        </p>
                        <div className="flex gap-4">
                            <Link to="/projects" className="bg-[#238636] hover:bg-[#2ea043] text-white px-6 py-3 rounded-md font-semibold transition-colors duration-200 shadow-lg shadow-[#238636]/20">
                                View Projects
                            </Link>
                            <a href="#resume" className="bg-white dark:bg-[#21262d] hover:bg-gray-50 dark:hover:bg-[#30363d] border border-gray-300 dark:border-[#30363d] text-gray-900 dark:text-[#c9d1d9] px-6 py-3 rounded-md font-semibold transition-colors duration-200">
                                Read Resume
                            </a>
                        </div>
                    </div>
                </div>
            </header>

            {/* --- BIO & INNOVATION FOCUS --- */}
            <section className="max-w-5xl mx-auto px-6 py-16">
                <div className="grid md:grid-cols-2 gap-12 items-center">
                    <div>
                        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4 transition-colors duration-300">The Engineering Mindset</h2>
                        <p className="text-gray-600 dark:text-[#8b949e] leading-relaxed mb-4 transition-colors duration-300">
                            My approach to software is grounded in my B.S. in Computer Science and Mathematics minor from Metropolitan State University. I don't just write code; I architect observable, scalable solutions.
                        </p>
                        <p className="text-gray-600 dark:text-[#8b949e] leading-relaxed transition-colors duration-300">
                            Whether managing telemetry via MTConnect, orchestrating C# and Python services, or designing sharded PostgreSQL databases, my focus is always on performance and fault tolerance.
                        </p>
                    </div>

                    <div className="bg-gray-900 dark:bg-[#161b22] border border-gray-800 dark:border-[#30363d] rounded-lg p-6 shadow-xl relative transition-colors duration-300">
                        <div className="absolute top-3 right-4 flex gap-1.5">
                            <div className="w-3 h-3 bg-[#da3633] rounded-full"></div>
                            <div className="w-3 h-3 bg-[#e3b341] rounded-full"></div>
                            <div className="w-3 h-3 bg-[#3fb950] rounded-full"></div>
                        </div>
                        <div className="font-mono text-sm text-[#3fb950] space-y-2 pt-6">
                            <p>$ kubectl get pods -n hom-central</p>
                            <p className="text-gray-400 dark:text-[#8b949e]">hom-api-v19 &nbsp;&nbsp;&nbsp;&nbsp; 2/2 &nbsp; RUNNING &nbsp; 3d12h</p>
                            <p className="text-gray-400 dark:text-[#8b949e]">hom-worker-a &nbsp;&nbsp;&nbsp; 1/1 &nbsp; RUNNING &nbsp; 19h</p>
                            <p className="text-gray-400 dark:text-[#8b949e]">redis-cache &nbsp;&nbsp;&nbsp;&nbsp; 1/1 &nbsp; RUNNING &nbsp; 5d</p>
                            <p className="text-gray-300 dark:text-[#c9d1d9]">$ Redis cache-hit metrics: <span className="text-[#e3b341]">98.1% (High)</span></p>
                            <div className="w-full h-1 bg-gray-700 dark:bg-[#30363d] rounded-full mt-4"><div className="w-[98%] h-1 bg-[#3fb950] rounded-full"></div></div>
                        </div>
                    </div>
                </div>
            </section>

            {/* --- CTA HUB & RESUME SECTION --- */}
            <section id="resume" className="max-w-5xl mx-auto px-6 py-16 border-t border-gray-200 dark:border-[#30363d] transition-colors duration-300">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-8 mb-12 bg-white dark:bg-[#161b22] p-8 rounded-xl border border-gray-200 dark:border-[#30363d] shadow-lg transition-colors duration-300">
                    <div>
                        <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-2 transition-colors duration-300">My Full Background</h2>
                        <p className="text-xl text-gray-600 dark:text-[#8b949e] transition-colors duration-300">Systems Engineering • DevOps • Full Stack • Mathematics</p>
                    </div>

                    <div className="flex flex-wrap gap-3">
                        <a href="https://linkedin.com/in/forest-lee" target="_blank" className="text-gray-600 dark:text-[#c9d1d9] bg-gray-50 dark:bg-[#21262d] p-3 rounded-lg border border-gray-200 dark:border-[#30363d] hover:border-[#58a6ff] hover:text-[#58a6ff] hover:bg-white dark:hover:bg-[#0d1117] transition-all duration-200"><FaLinkedin size={22}/></a>
                        <a href="https://github.com/heycat123" target="_blank" className="text-gray-600 dark:text-[#c9d1d9] bg-gray-50 dark:bg-[#21262d] p-3 rounded-lg border border-gray-200 dark:border-[#30363d] hover:border-gray-900 dark:hover:border-white hover:text-gray-900 dark:hover:text-white hover:bg-white dark:hover:bg-[#0d1117] transition-all duration-200"><FaGithub size={22}/></a>
                        <a href="https://profile.indeed.com/p/forestl-tsmcvzk" target="_blank" className="text-gray-600 dark:text-[#c9d1d9] bg-gray-50 dark:bg-[#21262d] p-3 rounded-lg border border-gray-200 dark:border-[#30363d] hover:border-[#3fb950] hover:text-[#3fb950] hover:bg-white dark:hover:bg-[#0d1117] transition-all duration-200"><SiIndeed size={22}/></a>
                        <a href="mailto:forest.a.lee@outlook.com" className="text-gray-600 dark:text-[#c9d1d9] bg-gray-50 dark:bg-[#21262d] p-3 rounded-lg border border-gray-200 dark:border-[#30363d] hover:border-[#e3b341] hover:text-[#e3b341] hover:bg-white dark:hover:bg-[#0d1117] transition-all duration-200"><Mail size={22}/></a>
                    </div>
                </div>

                <div className="grid md:grid-cols-2 gap-8 items-center bg-gray-50 dark:bg-[#0d1117] border border-gray-200 dark:border-[#30363d] p-8 rounded-xl shadow-inner transition-colors duration-300">
                    <div className="flex items-center gap-6">
                        <div className="text-[#58a6ff] shrink-0 p-4 rounded-full bg-white dark:bg-[#161b22] border border-gray-200 dark:border-[#30363d] shadow-md transition-colors duration-300">
                            <FileText size={48}/>
                        </div>
                        <div>
                            <h3 className="text-2xl font-semibold text-gray-900 dark:text-white transition-colors duration-300">Engineering Resume</h3>
                            <p className="text-gray-600 dark:text-[#8b949e] mb-2 transition-colors duration-300">View the detailed timeline of my technical background.</p>
                            <p className="text-xs font-mono text-gray-400 dark:text-[#484f58] transition-colors duration-300">PDF format • Last updated: Apr 2026</p>
                        </div>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-4 sm:justify-end w-full">
                        <a href="/Forest Lee - Senior Systems Engineer .pdf" target="_blank" className="bg-white dark:bg-[#21262d] hover:bg-gray-100 dark:hover:bg-[#30363d] border border-gray-300 dark:border-[#30363d] text-gray-800 dark:text-[#c9d1d9] px-6 py-3 rounded-md font-semibold text-center transition-colors duration-200 flex items-center justify-center gap-2">
                            <Terminal size={18}/> Read Resume PDF
                        </a>
                        <a href="/Forest Lee - Senior Systems Engineer .docx" download="Forest Lee - Senior Systems Engineer .docx" className="bg-[#238636] hover:bg-[#2ea043] text-white px-6 py-3 rounded-md font-semibold text-center transition-all duration-200 flex items-center justify-center gap-2 shadow-lg shadow-[#238636]/10">
                            <Download size={18}/> Save to MS Word
                        </a>
                    </div>
                </div>
            </section>
        </div>
    );
}