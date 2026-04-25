import React from 'react';

// 1. 🚀 Accept activeShard as a prop from the Dashboard
export default function ClusterGrid({ pods, flowStage, activeShard }) {
    return (
        <div className="cluster-grid" style={{
            border: '2px dashed #444',
            padding: '20px',
            minHeight: '300px',
            borderRadius: '8px',
            backgroundColor: '#0d1117'
        }}>
            <h3 style={{ color: '#8b949e', marginTop: 0 }}>Cluster Namespace: default</h3>

            {pods.length === 0 ? (
                <p style={{ color: '#8b949e', textAlign: 'center', marginTop: '100px' }}>
                    Cluster is empty. Waiting for deployments...
                </p>
            ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '15px' }}>
                    {pods.map((pod, index) => (
                        // 2. 🚀 Pass activeShard down to the individual Pod component
                        <Pod
                            key={`${pod.name}-${index}`}
                            data={pod}
                            flowStage={flowStage}
                            activeShard={activeShard}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

// 3. 🚀 Accept activeShard in the Pod component
function Pod({ data, flowStage, activeShard }) {
    const name = data?.name || "Initializing...";
    const status = data?.status || "Unknown";
    const lowercaseName = name.toLowerCase();

    // 🎨 1. Determine base color based on the service type
    const getThemeColor = (n) => {
        if (n.includes('postgres')) return '#336791';
        if (n.includes('rabbitmq')) return '#ff6600';
        if (n.includes('dotnet') || n.includes('worker')) return '#512bd4';
        if (n.includes('api') || n.includes('node')) return '#339933';
        return '#8b949e';
    };

    const themeColor = getThemeColor(lowercaseName);

    // ✨ 2. Logic to "Light Up" the pod based on the current system stage
    const isHighlighted = () => {
        if (flowStage === 1 && (lowercaseName.includes('api') || lowercaseName.includes('node'))) return true;
        if (flowStage === 2 && lowercaseName.includes('rabbitmq')) return true;
        if (flowStage === 3 && (lowercaseName.includes('worker') || lowercaseName.includes('dotnet'))) return true;

        // 4. 🚀 The new, strict Shard routing logic
        if (flowStage === 4 && lowercaseName.includes('postgres')) {
            // ONLY light up Shard B if activeShard is B
            if (activeShard === 'B' && lowercaseName.includes('shard-b')) return true;

            // ONLY light up Shard A if activeShard is A (meaning it DOES NOT have shard-b in the name)
            if (activeShard === 'A' && !lowercaseName.includes('shard-b')) return true;

            return false;
        }

        return false;
    };

    // 🎆 3. Apply the "Glow" styles if active
    const activeHighlight = isHighlighted();
    const podStyle = {
        borderTop: `4px solid ${themeColor}`,
        borderRadius: '6px',
        padding: '15px',
        backgroundColor: '#161b22',
        color: '#c9d1d9',
        textAlign: 'center',
        boxShadow: activeHighlight
            ? `0 0 25px ${themeColor}aa`  // Outer glow
            : '0 4px 6px rgba(0,0,0,0.3)',
        transform: activeHighlight ? 'scale(1.08)' : 'scale(1)',
        filter: activeHighlight ? 'brightness(1.3)' : 'brightness(1)',
        transition: 'all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)', // Bouncy transition
        zIndex: activeHighlight ? 10 : 1
    };

    return (
        <div style={podStyle}>
            <div style={{ fontSize: '24px', marginBottom: '5px' }}>📦</div>
            <div style={{ fontWeight: 'bold', fontSize: '12px', wordBreak: 'break-all' }}>
                {name}
            </div>

            <div style={{
                fontSize: '11px',
                color: status === 'Running' ? '#3fb950' : '#e3b341',
                marginTop: '10px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '5px'
            }}>
                <span style={{ fontSize: '8px' }}>●</span> {status}
            </div>
        </div>
    );
}